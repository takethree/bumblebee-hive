[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$HiveBaseUrl = "https://hive.example.com",
  [string]$BumblebeeVersion = "v0.1.2",
  [string]$ReleaseBaseUrl,
  [string]$InstallRoot = "$env:ProgramFiles\Bumblebee",
  [string]$ConfigRoot = "$env:ProgramData\Bumblebee",
  [string]$CacheRoot = "$env:LOCALAPPDATA\Bumblebee\catalog-cache",
  [string]$TaskName = "\Bumblebee\Baseline",
  [int]$IntervalHours = 6,
  [ValidateSet("ManagedHive", "UpstreamHttp")]
  [string]$BumblebeeMode = "ManagedHive",
  [string]$EnrollmentToken,
  [string]$AccessClientId,
  [string]$AccessClientSecret,
  [ValidateSet("production", "test")]
  [string]$Environment = "production",
  [switch]$SkipDownload,
  [string]$BumblebeeExePath,
  [switch]$SkipEnroll,
  [string]$DeviceId,
  [string]$HmacKey,
  [string]$ScanProfile = "baseline",
  [string[]]$ScanRoot = @(),
  [switch]$SkipSchedule,
  [switch]$SkipSelfTest,
  [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required"
  }
}

function Get-ReleaseAsset {
  param(
    [string]$Version,
    [string]$BaseUrl,
    [string]$WorkDir
  )

  $tagName = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
  $assetVersion = $Version -replace "^v", ""
  $assetName = "bumblebee_${assetVersion}_windows_amd64.zip"
  $zipUrl = "$BaseUrl/$tagName/$assetName"
  $checksumsUrl = "$BaseUrl/$tagName/checksums.txt"
  $zipPath = Join-Path $WorkDir $assetName
  $checksumsPath = Join-Path $WorkDir "checksums.txt"

  Invoke-WebRequest -Uri $checksumsUrl -OutFile $checksumsPath
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath

  $checksumLine = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match [regex]::Escape($assetName) } | Select-Object -First 1
  if (-not $checksumLine) {
    throw "checksums.txt did not contain $assetName"
  }
  $expected = ($checksumLine -split "\s+")[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "SHA256 mismatch for $assetName"
  }
  $zipPath
}

function Install-Binary {
  param(
    [string]$SourceExe,
    [string]$TargetRoot
  )

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  $targetExe = Join-Path $TargetRoot "bumblebee.exe"
  Copy-Item -LiteralPath $SourceExe -Destination $targetExe -Force
  $targetExe
}

function Expand-BumblebeeZip {
  param(
    [string]$ZipPath,
    [string]$WorkDir
  )

  $extractRoot = Join-Path $WorkDir "extract"
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $extractRoot -Force
  $exe = Get-ChildItem -LiteralPath $extractRoot -Filter "bumblebee.exe" -Recurse | Select-Object -First 1
  if (-not $exe) {
    throw "release archive did not contain bumblebee.exe"
  }
  $exe.FullName
}

function Remove-FileIfPresent {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    Remove-Item -LiteralPath $Path -Force
  }
}

function Remove-DirectoryIfEmpty {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path -PathType Container) {
    $child = Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $child) {
      Remove-Item -LiteralPath $Path -Force
    }
  }
}

function Uninstall-Bumblebee {
  param(
    [string]$TargetRoot,
    [string]$TargetConfigRoot,
    [string]$TargetTaskName
  )

  if (-not $SkipSchedule) {
    $task = Get-ScheduledTask -TaskName $TargetTaskName -ErrorAction SilentlyContinue
    if ($task) {
      Unregister-ScheduledTask -TaskName $TargetTaskName -Confirm:$false
    }
  }

  Remove-FileIfPresent -Path (Join-Path $TargetConfigRoot "run-baseline.ps1")
  Remove-FileIfPresent -Path (Join-Path $TargetConfigRoot "secrets.clixml")
  Remove-FileIfPresent -Path (Join-Path $TargetConfigRoot "secrets.json")
  Remove-FileIfPresent -Path (Join-Path $TargetConfigRoot "config.json")
  Remove-DirectoryIfEmpty -Path $TargetConfigRoot

  Remove-FileIfPresent -Path (Join-Path $TargetRoot "bumblebee.exe")
  Remove-DirectoryIfEmpty -Path $TargetRoot

  [pscustomobject]@{
    install_root = $TargetRoot
    config_root = $TargetConfigRoot
    task_name = $TargetTaskName
    uninstalled = $true
  } | ConvertTo-Json
}

function Invoke-BumblebeeHiveJoin {
  param(
    [string]$BumblebeeExe,
    [string]$BaseUrl,
    [string]$TargetConfigRoot,
    [string]$TargetCacheRoot,
    [string]$Profile,
    [string[]]$Roots,
    [string]$DeviceEnvironment,
    [string]$ClientId,
    [string]$ClientSecret,
    [string]$Token
  )

  $oldAccessId = [Environment]::GetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_ID", "Process")
  $oldAccessSecret = [Environment]::GetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_SECRET", "Process")
  $oldEnrollToken = [Environment]::GetEnvironmentVariable("BUMBLEBEE_ENROLLMENT_TOKEN", "Process")
  try {
    [Environment]::SetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_ID", $ClientId, "Process")
    [Environment]::SetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_SECRET", $ClientSecret, "Process")
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
      [Environment]::SetEnvironmentVariable("BUMBLEBEE_ENROLLMENT_TOKEN", $Token, "Process")
    } else {
      [Environment]::SetEnvironmentVariable("BUMBLEBEE_ENROLLMENT_TOKEN", $null, "Process")
    }

    $joinArgs = @(
      "hive", "join",
      "--base-url", $BaseUrl.TrimEnd("/"),
      "--config-dir", $TargetConfigRoot,
      "--cache-dir", $TargetCacheRoot,
      "--scan-profile", $Profile,
      "--environment", $DeviceEnvironment
    )
    foreach ($root in @($Roots)) {
      $joinArgs += @("--root", [string]$root)
    }

    & $BumblebeeExe @joinArgs
    if ($LASTEXITCODE -ne 0) {
      throw "bumblebee hive join failed with exit code $LASTEXITCODE"
    }
  } finally {
    [Environment]::SetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_ID", $oldAccessId, "Process")
    [Environment]::SetEnvironmentVariable("BUMBLEBEE_ACCESS_CLIENT_SECRET", $oldAccessSecret, "Process")
    [Environment]::SetEnvironmentVariable("BUMBLEBEE_ENROLLMENT_TOKEN", $oldEnrollToken, "Process")
  }
}

function Invoke-HiveEnroll {
  param(
    [string]$BaseUrl,
    [string]$DeviceEnvironment,
    [string]$ClientId,
    [string]$ClientSecret,
    [string]$Token
  )

  Require-Value -Name "EnrollmentToken" -Value $Token
  $headers = @{
    "CF-Access-Client-Id" = $ClientId
    "CF-Access-Client-Secret" = $ClientSecret
    "X-Hive-Enroll-Token" = $Token
  }
  $body = @{ environment = $DeviceEnvironment } | ConvertTo-Json -Depth 3
  Invoke-RestMethod -Method Post -Uri (($BaseUrl.TrimEnd("/")) + "/v1/enroll") -Headers $headers -Body $body -ContentType "application/json"
}

function Write-ManagedRunScript {
  param(
    [string]$Path,
    [string]$BumblebeeExe,
    [string]$TargetConfigRoot,
    [string]$TargetCacheRoot
  )

  $template = @'
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$bumblebeeExe = '__BUMBLEBEE_EXE__'
$configRoot = '__CONFIG_ROOT__'
$cacheRoot = '__CACHE_ROOT__'

$runArgs = @(
  "hive", "run",
  "--config-dir", $configRoot,
  "--cache-dir", $cacheRoot,
  "--max-duration", "5m"
)

& $bumblebeeExe @runArgs

exit $LASTEXITCODE
'@
  $content = $template.Replace("__BUMBLEBEE_EXE__", $BumblebeeExe.Replace("'", "''")).
    Replace("__CONFIG_ROOT__", $TargetConfigRoot.Replace("'", "''")).
    Replace("__CACHE_ROOT__", $TargetCacheRoot.Replace("'", "''"))
  $content | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Write-UpstreamRunScript {
  param(
    [string]$Path,
    [string]$BumblebeeExe,
    [string]$TargetConfigRoot
  )

  $template = @'
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$bumblebeeExe = '__BUMBLEBEE_EXE__'
$configRoot = '__CONFIG_ROOT__'
$config = Get-Content -LiteralPath (Join-Path $configRoot 'config.json') -Raw | ConvertFrom-Json
$secrets = Get-Content -LiteralPath (Join-Path $configRoot 'secrets.json') -Raw | ConvertFrom-Json

[Environment]::SetEnvironmentVariable('BUMBLEBEE_HIVE_DEVICE_ID', [string]$config.device_id, 'Process')
[Environment]::SetEnvironmentVariable('BUMBLEBEE_HIVE_HMAC_KEY', [string]$secrets.hmac_key, 'Process')

$ingestUrl = ([string]$config.base_url).TrimEnd('/') + [string]$config.ingest_path
$runArgs = @(
  'scan',
  '--profile', [string]$config.scan_profile,
  '--max-duration', '5m',
  '--output', 'http',
  '--http-url', $ingestUrl,
  '--http-auth', 'hmac-sha256',
  '--http-hmac-key-env', 'BUMBLEBEE_HIVE_HMAC_KEY',
  '--http-gzip',
  '--device-id-env', 'BUMBLEBEE_HIVE_DEVICE_ID'
)

foreach ($root in @($config.scan_roots)) {
  if (-not [string]::IsNullOrWhiteSpace([string]$root)) {
    $runArgs += @('--root', [string]$root)
  }
}

& $bumblebeeExe @runArgs

exit $LASTEXITCODE
'@
  $content = $template.Replace("__BUMBLEBEE_EXE__", $BumblebeeExe.Replace("'", "''")).
    Replace("__CONFIG_ROOT__", $TargetConfigRoot.Replace("'", "''"))
  $content | Set-Content -LiteralPath $Path -Encoding UTF8
}

Require-Value -Name "HiveBaseUrl" -Value $HiveBaseUrl

if ($Uninstall) {
  if ($PSCmdlet.ShouldProcess($InstallRoot, "Uninstall Bumblebee local files and scheduled task")) {
    Uninstall-Bumblebee -TargetRoot $InstallRoot -TargetConfigRoot $ConfigRoot -TargetTaskName $TaskName
  }
  return
}

Require-Value -Name "AccessClientId" -Value $AccessClientId
Require-Value -Name "AccessClientSecret" -Value $AccessClientSecret

if ($PSCmdlet.ShouldProcess($InstallRoot, "Install Bumblebee and configure Hive enrollment")) {
  $workDir = Join-Path ([IO.Path]::GetTempPath()) ("bumblebee-install-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $workDir | Out-Null
  try {
    if ($SkipDownload) {
      Require-Value -Name "BumblebeeExePath" -Value $BumblebeeExePath
      $sourceExe = $BumblebeeExePath
    } else {
      Require-Value -Name "ReleaseBaseUrl" -Value $ReleaseBaseUrl
      $zipPath = Get-ReleaseAsset -Version $BumblebeeVersion -BaseUrl $ReleaseBaseUrl -WorkDir $workDir
      $sourceExe = Expand-BumblebeeZip -ZipPath $zipPath -WorkDir $workDir
    }

    $installedExe = Install-Binary -SourceExe $sourceExe -TargetRoot $InstallRoot
    if (-not $SkipSelfTest) {
      & $installedExe selftest
      if ($LASTEXITCODE -ne 0) {
        throw "bumblebee selftest failed with exit code $LASTEXITCODE"
      }
    }

    New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null

    if ($SkipEnroll) {
      Require-Value -Name "DeviceId" -Value $DeviceId
      Require-Value -Name "HmacKey" -Value $HmacKey
      $ingestPath = if ($BumblebeeMode -eq "UpstreamHttp") { "/v1/compat/ingest/$DeviceId" } else { "/v1/ingest" }
      $config = [ordered]@{
        base_url = $HiveBaseUrl.TrimEnd("/")
        ingest_path = $ingestPath
        device_id = $DeviceId
        environment = $Environment
        scan_profile = $ScanProfile
        scan_roots = @($ScanRoot)
        transport_mode = $BumblebeeMode
      }
      $secrets = [ordered]@{
        access_client_id = $AccessClientId
        access_client_secret = $AccessClientSecret
        hmac_key = $HmacKey
      }
      $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ConfigRoot "config.json") -Encoding UTF8
      $secrets | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ConfigRoot "secrets.json") -Encoding UTF8
    } elseif ($BumblebeeMode -eq "ManagedHive") {
      Invoke-BumblebeeHiveJoin `
        -BumblebeeExe $installedExe `
        -BaseUrl $HiveBaseUrl `
        -TargetConfigRoot $ConfigRoot `
        -TargetCacheRoot $CacheRoot `
        -Profile $ScanProfile `
        -Roots @($ScanRoot) `
        -DeviceEnvironment $Environment `
        -ClientId $AccessClientId `
        -ClientSecret $AccessClientSecret `
        -Token $EnrollmentToken
    } else {
      $enrollment = Invoke-HiveEnroll `
        -BaseUrl $HiveBaseUrl `
        -DeviceEnvironment $Environment `
        -ClientId $AccessClientId `
        -ClientSecret $AccessClientSecret `
        -Token $EnrollmentToken
      $config = [ordered]@{
        base_url = $HiveBaseUrl.TrimEnd("/")
        ingest_path = [string]$enrollment.upstream_ingest_path
        device_id = [string]$enrollment.device_id
        environment = [string]$enrollment.environment
        scan_profile = $ScanProfile
        scan_roots = @($ScanRoot)
        transport_mode = $BumblebeeMode
      }
      $secrets = [ordered]@{
        hmac_key = [string]$enrollment.hmac_key
      }
      $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ConfigRoot "config.json") -Encoding UTF8
      $secrets | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ConfigRoot "secrets.json") -Encoding UTF8
    }

    $savedConfig = Get-Content -LiteralPath (Join-Path $ConfigRoot "config.json") -Raw | ConvertFrom-Json

    $runScript = Join-Path $ConfigRoot "run-baseline.ps1"
    if ($BumblebeeMode -eq "UpstreamHttp") {
      Write-UpstreamRunScript -Path $runScript -BumblebeeExe $installedExe -TargetConfigRoot $ConfigRoot
    } else {
      Write-ManagedRunScript -Path $runScript -BumblebeeExe $installedExe -TargetConfigRoot $ConfigRoot -TargetCacheRoot $CacheRoot
    }

    if (-not $SkipSchedule) {
      $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)
      $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
      Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Run Bumblebee baseline inventory" -Force | Out-Null
    }

    [pscustomobject]@{
      installed_exe = $installedExe
      config_root = $ConfigRoot
      cache_root = $CacheRoot
      device_id = [string]$savedConfig.device_id
      environment = [string]$savedConfig.environment
      bumblebee_mode = $BumblebeeMode
      scheduled = -not $SkipSchedule
    } | ConvertTo-Json
  } finally {
    Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
