[CmdletBinding()]
param(
  [ValidateSet("CheckOnly", "Direct", "Scheduled")]
  [string]$Mode = "CheckOnly",
  [string]$InstallRoot = "$env:LOCALAPPDATA\Programs\Bumblebee",
  [string]$ConfigRoot = "$env:APPDATA\Bumblebee",
  [string]$TaskName = "Bumblebee Baseline Pilot",
  [string]$AdminSecretsPath = ".local\deployment-secrets.clixml",
  [int]$WaitSeconds = 180,
  [int]$PollSeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$forbiddenFields = @("summary_json", "object_key", "hmac_key_ciphertext", "hmac_key_nonce", "body_sha256", "raw")
$repoRoot = Split-Path -Parent $PSScriptRoot

function New-Check {
  param([string]$Name, [bool]$Passed, [object]$Detail = $null)
  $check = [ordered]@{ name = $Name; passed = $Passed }
  if ($null -ne $Detail) {
    $check.detail = $Detail
  }
  [pscustomobject]$check
}

function Convert-SecureStringToPlainText {
  param([securestring]$Value)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }
}

function Resolve-OperatorPath {
  param([string]$Path)
  if ([IO.Path]::IsPathRooted($Path)) {
    return $Path
  }
  Join-Path $repoRoot $Path
}

function Redact-Text {
  param(
    [string]$Text,
    [object]$Config = $null
  )
  if ($null -eq $Text) {
    return ""
  }
  $redacted = $Text
  $replacements = @{}
  foreach ($item in @(
    @($env:USERPROFILE, "%USERPROFILE%"),
    @($env:APPDATA, "%APPDATA%"),
    @($env:LOCALAPPDATA, "%LOCALAPPDATA%"),
    @($env:ProgramFiles, "%ProgramFiles%"),
    @($env:ProgramData, "%ProgramData%")
  )) {
    if (-not [string]::IsNullOrWhiteSpace($item[0])) {
      $replacements[$item[0]] = $item[1]
    }
  }
  if ($null -ne $Config -and $Config.PSObject.Properties["device_id"] -and -not [string]::IsNullOrWhiteSpace([string]$Config.device_id)) {
    $replacements[[string]$Config.device_id] = "<redacted-device-id>"
  }
  foreach ($key in $replacements.Keys) {
    $redacted = $redacted -replace [regex]::Escape($key), $replacements[$key]
  }
  $redacted
}

function Get-JsonProperty {
  param([object]$Object, [string]$Name)
  if ($null -eq $Object -or -not $Object.PSObject.Properties[$Name]) {
    return $null
  }
  $Object.PSObject.Properties[$Name].Value
}

function Add-Failure {
  param([System.Collections.Generic.List[string]]$Failures, [string]$Code)
  if (-not $Failures.Contains($Code)) {
    $Failures.Add($Code)
  }
}

function Test-ForbiddenFields {
  param([string]$Body)
  @($forbiddenFields | Where-Object { $Body -match [regex]::Escape($_) })
}

function New-HiveClient {
  param([object]$AdminSecrets)
  Add-Type -AssemblyName System.Net.Http
  $client = [System.Net.Http.HttpClient]::new()
  $client.DefaultRequestHeaders.TryAddWithoutValidation("CF-Access-Client-Id", (Convert-SecureStringToPlainText $AdminSecrets.ACCESS_CLIENT_ID)) | Out-Null
  $client.DefaultRequestHeaders.TryAddWithoutValidation("CF-Access-Client-Secret", (Convert-SecureStringToPlainText $AdminSecrets.ACCESS_CLIENT_SECRET)) | Out-Null
  $client.DefaultRequestHeaders.TryAddWithoutValidation("X-Hive-Admin-Token", (Convert-SecureStringToPlainText $AdminSecrets.ADMIN_TOKEN)) | Out-Null
  $client
}

function Invoke-HiveAdmin {
  param(
    [System.Net.Http.HttpClient]$Client,
    [string]$HiveBaseUrl,
    [string]$Path
  )
  $uri = $HiveBaseUrl.TrimEnd("/") + $Path
  $response = $Client.GetAsync($uri).GetAwaiter().GetResult()
  $bodyText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $body = $null
  if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
    $body = $bodyText | ConvertFrom-Json
  }
  [pscustomobject]@{
    status_code = [int]$response.StatusCode
    cache_control = if ($response.Headers.CacheControl) { $response.Headers.CacheControl.ToString() } else { "" }
    body_text = $bodyText
    body = $body
  }
}

function Get-LatestRun {
  param(
    [System.Net.Http.HttpClient]$Client,
    [object]$Config
  )
  $deviceID = [uri]::EscapeDataString([string]$Config.device_id)
  $profile = [uri]::EscapeDataString([string]$Config.scan_profile)
  $response = Invoke-HiveAdmin -Client $Client -HiveBaseUrl ([string]$Config.hive_base_url) -Path "/v1/admin/runs?device_id=$deviceID&profile=$profile&limit=1&offset=0"
  $runs = @(Get-JsonProperty -Object $response.body -Name "runs")
  if ($response.status_code -ne 200 -or $runs.Count -eq 0) {
    return [pscustomobject]@{
      exists = $false
      status_code = $response.status_code
      cache_control = $response.cache_control
      forbidden_matches = @(Test-ForbiddenFields -Body $response.body_text)
      status = $null
      received_at = $null
    }
  }
  $run = $runs[0]
  [pscustomobject]@{
    exists = $true
    status_code = $response.status_code
    cache_control = $response.cache_control
    forbidden_matches = @(Test-ForbiddenFields -Body $response.body_text)
    status = [string]$run.status
    received_at = [DateTimeOffset]::Parse([string]$run.received_at)
  }
}

function Wait-ForFreshRun {
  param(
    [System.Net.Http.HttpClient]$Client,
    [object]$Config,
    [object]$PreviousReceivedAt,
    [DateTimeOffset]$StartedAt,
    [int]$TimeoutSeconds,
    [int]$IntervalSeconds
  )
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  $latest = $null
  do {
    $latest = Get-LatestRun -Client $Client -Config $Config
    if ($latest.exists -and $latest.status -eq "complete" -and $latest.forbidden_matches.Count -eq 0) {
      $afterPrevious = $true
      if ($null -ne $PreviousReceivedAt) {
        $afterPrevious = $latest.received_at -gt ([DateTimeOffset]$PreviousReceivedAt)
      }
      $nearTrigger = $latest.received_at -ge $StartedAt.AddSeconds(-60)
      if ($afterPrevious -and $nearTrigger) {
        return [pscustomobject]@{ observed = $true; latest = $latest }
      }
    }
    Start-Sleep -Seconds $IntervalSeconds
  } while ([DateTimeOffset]::UtcNow -lt $deadline)
  [pscustomobject]@{ observed = $false; latest = $latest }
}

function Invoke-Wrapper {
  param([string]$RunScript)
  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("bumblebee-pilot-verify-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $stdout = Join-Path $tempRoot "stdout.txt"
  $stderr = Join-Path $tempRoot "stderr.txt"
  try {
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $RunScript) -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -Wait -PassThru
    [pscustomobject]@{
      exit_code = $process.ExitCode
      stdout_bytes = if (Test-Path -LiteralPath $stdout) { (Get-Item -LiteralPath $stdout).Length } else { 0 }
      stderr_bytes = if (Test-Path -LiteralPath $stderr) { (Get-Item -LiteralPath $stderr).Length } else { 0 }
    }
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-ScheduledTaskRun {
  param(
    [string]$Name,
    [DateTimeOffset]$StartedAt,
    [int]$TimeoutSeconds,
    [int]$IntervalSeconds
  )
  Start-ScheduledTask -TaskName $Name
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $task = Get-ScheduledTask -TaskName $Name
    $info = $task | Get-ScheduledTaskInfo
    $lastRun = [DateTimeOffset]$info.LastRunTime
    if ([string]$task.State -ne "Running" -and $lastRun -ge $StartedAt.AddSeconds(-5)) {
      return [pscustomobject]@{
        completed = $true
        state = [string]$task.State
        last_result = $info.LastTaskResult
      }
    }
    Start-Sleep -Seconds $IntervalSeconds
  } while ([DateTimeOffset]::UtcNow -lt $deadline)
  $task = Get-ScheduledTask -TaskName $Name
  $info = $task | Get-ScheduledTaskInfo
  [pscustomobject]@{
    completed = $false
    state = [string]$task.State
    last_result = $info.LastTaskResult
  }
}

$checks = [System.Collections.Generic.List[object]]::new()
$failures = [System.Collections.Generic.List[string]]::new()
$client = $null
$config = $null

try {
  $configPath = Join-Path $ConfigRoot "config.json"
  $runScript = Join-Path $ConfigRoot "run-baseline.ps1"
  $localSecretsPath = Join-Path $ConfigRoot "secrets.clixml"
  $adminSecretsResolved = Resolve-OperatorPath -Path $AdminSecretsPath
  $expectedExe = Join-Path $InstallRoot "bumblebee.exe"

  $configExists = Test-Path -LiteralPath $configPath -PathType Leaf
  $checks.Add((New-Check -Name "config_present" -Passed $configExists))
  if (-not $configExists) {
    Add-Failure -Failures $failures -Code "missing_config"
    throw "missing_config"
  }

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $configuredExe = [string]$config.bumblebee_exe
  $configuredIngest = [uri]([string]$config.ingest_url)

  $checks.Add((New-Check -Name "local_secrets_present" -Passed (Test-Path -LiteralPath $localSecretsPath -PathType Leaf)))
  $checks.Add((New-Check -Name "run_script_present" -Passed (Test-Path -LiteralPath $runScript -PathType Leaf)))
  $checks.Add((New-Check -Name "expected_binary_present" -Passed (Test-Path -LiteralPath $expectedExe -PathType Leaf)))
  $checks.Add((New-Check -Name "configured_binary_present" -Passed (Test-Path -LiteralPath $configuredExe -PathType Leaf)))
  $checks.Add((New-Check -Name "configured_device_id_present" -Passed (-not [string]::IsNullOrWhiteSpace([string]$config.device_id))))
  $checks.Add((New-Check -Name "configured_ingest_path" -Passed ($configuredIngest.AbsolutePath -eq "/v1/ingest") -Detail @{ path = $configuredIngest.AbsolutePath }))
  $checks.Add((New-Check -Name "configured_scan_profile" -Passed (-not [string]::IsNullOrWhiteSpace([string]$config.scan_profile)) -Detail @{ profile = [string]$config.scan_profile }))

  foreach ($check in $checks) {
    if (-not $check.passed) {
      Add-Failure -Failures $failures -Code $check.name
    }
  }

  if (Test-Path -LiteralPath $configuredExe -PathType Leaf) {
    & $configuredExe selftest *> $null
    $checks.Add((New-Check -Name "selftest_passed" -Passed ($LASTEXITCODE -eq 0) -Detail @{ exit_code = $LASTEXITCODE }))
    if ($LASTEXITCODE -ne 0) {
      Add-Failure -Failures $failures -Code "selftest_failed"
    }
  }

  $adminSecretsPresent = Test-Path -LiteralPath $adminSecretsResolved -PathType Leaf
  $checks.Add((New-Check -Name "admin_secrets_present" -Passed $adminSecretsPresent))
  if (-not $adminSecretsPresent) {
    Add-Failure -Failures $failures -Code "missing_admin_secrets"
    throw "missing_admin_secrets"
  }
  $adminSecrets = Import-Clixml -LiteralPath $adminSecretsResolved
  foreach ($secretName in @("ACCESS_CLIENT_ID", "ACCESS_CLIENT_SECRET", "ADMIN_TOKEN")) {
    $present = $null -ne (Get-JsonProperty -Object $adminSecrets -Name $secretName)
    $checks.Add((New-Check -Name ("admin_secret_" + $secretName.ToLowerInvariant() + "_present") -Passed $present))
    if (-not $present) {
      Add-Failure -Failures $failures -Code ("missing_" + $secretName.ToLowerInvariant())
    }
  }

  $client = New-HiveClient -AdminSecrets $adminSecrets
  $adminResponses = @()
  foreach ($adminPath in @("/v1/admin/overview", "/v1/admin/devices?status=all&limit=5&offset=0", "/v1/admin/runs?limit=5&offset=0")) {
    $response = Invoke-HiveAdmin -Client $client -HiveBaseUrl ([string]$config.hive_base_url) -Path $adminPath
    $matches = @(Test-ForbiddenFields -Body $response.body_text)
    $adminResponses += [pscustomobject]@{
      path = $adminPath
      status_code = $response.status_code
      cache_control = $response.cache_control
      forbidden_match_count = $matches.Count
    }
    if ($response.status_code -ne 200) {
      Add-Failure -Failures $failures -Code ("admin_endpoint_failed_" + ($adminPath -replace "[^A-Za-z0-9]", "_"))
    }
    if ($response.cache_control -ne "no-store") {
      Add-Failure -Failures $failures -Code ("admin_endpoint_cache_control_" + ($adminPath -replace "[^A-Za-z0-9]", "_"))
    }
    if ($matches.Count -gt 0) {
      Add-Failure -Failures $failures -Code ("admin_endpoint_forbidden_fields_" + ($adminPath -replace "[^A-Za-z0-9]", "_"))
    }
  }

  $latestBefore = Get-LatestRun -Client $client -Config $config
  if ($latestBefore.forbidden_matches.Count -gt 0) {
    Add-Failure -Failures $failures -Code "latest_run_forbidden_fields"
  }

  $runResult = $null
  $freshRun = $null
  if ($Mode -eq "Direct") {
    $startedAt = [DateTimeOffset]::UtcNow
    $runResult = Invoke-Wrapper -RunScript $runScript
    if ($runResult.exit_code -ne 0) {
      Add-Failure -Failures $failures -Code "direct_wrapper_failed"
    }
    $freshRun = Wait-ForFreshRun -Client $client -Config $config -PreviousReceivedAt $latestBefore.received_at -StartedAt $startedAt -TimeoutSeconds $WaitSeconds -IntervalSeconds $PollSeconds
    if (-not $freshRun.observed) {
      Add-Failure -Failures $failures -Code "fresh_hive_run_not_observed"
    }
  } elseif ($Mode -eq "Scheduled") {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $taskPresent = $null -ne $task
    $checks.Add((New-Check -Name "scheduled_task_present" -Passed $taskPresent))
    if (-not $taskPresent) {
      Add-Failure -Failures $failures -Code "scheduled_task_missing"
    } else {
      $startedAt = [DateTimeOffset]::UtcNow
      $runResult = Invoke-ScheduledTaskRun -Name $TaskName -StartedAt $startedAt -TimeoutSeconds $WaitSeconds -IntervalSeconds $PollSeconds
      if (-not $runResult.completed) {
        Add-Failure -Failures $failures -Code "scheduled_task_timeout"
      }
      if ($runResult.last_result -ne 0) {
        Add-Failure -Failures $failures -Code "scheduled_task_failed"
      }
      $freshRun = Wait-ForFreshRun -Client $client -Config $config -PreviousReceivedAt $latestBefore.received_at -StartedAt $startedAt -TimeoutSeconds $WaitSeconds -IntervalSeconds $PollSeconds
      if (-not $freshRun.observed) {
        Add-Failure -Failures $failures -Code "fresh_hive_run_not_observed"
      }
    }
  } else {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $taskPresent = $null -ne $task
    $checks.Add((New-Check -Name "scheduled_task_present" -Passed $taskPresent))
    if ($taskPresent) {
      $info = $task | Get-ScheduledTaskInfo
      $checks.Add((New-Check -Name "scheduled_task_last_result_zero" -Passed ($info.LastTaskResult -eq 0) -Detail @{ last_result = $info.LastTaskResult }))
    }
  }

  $ok = $failures.Count -eq 0
  $output = [ordered]@{
    ok = $ok
    mode = $Mode
    checks = @($checks)
    admin_endpoints = @($adminResponses)
    latest_run = [ordered]@{
      exists = $latestBefore.exists
      status = $latestBefore.status
      received_at_present = $null -ne $latestBefore.received_at
      forbidden_match_count = $latestBefore.forbidden_matches.Count
    }
    run_execution = if ($null -ne $runResult) {
      [ordered]@{
        attempted = $true
        exit_code = if ($runResult.PSObject.Properties["exit_code"]) { $runResult.exit_code } else { $null }
        completed = if ($runResult.PSObject.Properties["completed"]) { $runResult.completed } else { $null }
        last_result = if ($runResult.PSObject.Properties["last_result"]) { $runResult.last_result } else { $null }
        stdout_bytes = if ($runResult.PSObject.Properties["stdout_bytes"]) { $runResult.stdout_bytes } else { $null }
        stderr_bytes = if ($runResult.PSObject.Properties["stderr_bytes"]) { $runResult.stderr_bytes } else { $null }
      }
    } else {
      [ordered]@{ attempted = $false }
    }
    fresh_run = if ($null -ne $freshRun) {
      [ordered]@{
        observed = $freshRun.observed
        status = if ($freshRun.latest) { $freshRun.latest.status } else { $null }
        received_at_present = if ($freshRun.latest) { $null -ne $freshRun.latest.received_at } else { $false }
        forbidden_match_count = if ($freshRun.latest) { $freshRun.latest.forbidden_matches.Count } else { 0 }
      }
    } else {
      [ordered]@{ observed = $false; not_requested = $true }
    }
    failures = @($failures)
  }
  $output | ConvertTo-Json -Depth 8
  if (-not $ok) {
    exit 1
  }
} catch {
  if ($failures.Count -eq 0) {
    Add-Failure -Failures $failures -Code "unexpected_error"
  }
  [ordered]@{
    ok = $false
    mode = $Mode
    checks = @($checks)
    failures = @($failures)
    error = [ordered]@{
      type = $_.Exception.GetType().Name
      message = Redact-Text -Text $_.Exception.Message -Config $config
    }
  } | ConvertTo-Json -Depth 8
  exit 1
} finally {
  if ($null -ne $client) {
    $client.Dispose()
  }
}
