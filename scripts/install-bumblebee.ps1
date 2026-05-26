[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$HiveBaseUrl = "https://hive.example.com",
  [string]$BumblebeeVersion = "v0.1.1",
  [string]$ReleaseBaseUrl,
  [string]$InstallRoot = "$env:ProgramFiles\Bumblebee",
  [string]$ConfigRoot = "$env:ProgramData\Bumblebee",
  [string]$TaskName = "\Bumblebee\Baseline",
  [int]$IntervalHours = 6,
  [string]$EnrollmentToken,
  [string]$AccessClientId,
  [string]$AccessClientSecret,
  [switch]$SkipDownload,
  [string]$BumblebeeExePath,
  [switch]$SkipEnroll,
  [string]$DeviceId,
  [string]$HmacKey,
  [string]$ScanProfile = "baseline",
  [string[]]$ScanRoot = @(),
  [switch]$SkipSchedule,
  [switch]$SkipSelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required"
  }
}

function Protect-String {
  param([string]$Value)
  ConvertTo-SecureString -String $Value -AsPlainText -Force
}

function Get-PlainText {
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

function Get-ReleaseAsset {
  param(
    [string]$Version,
    [string]$BaseUrl,
    [string]$WorkDir
  )

  $assetName = "bumblebee_${Version}_windows_amd64.zip"
  $zipUrl = "$BaseUrl/$Version/$assetName"
  $checksumsUrl = "$BaseUrl/$Version/checksums.txt"
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

function Invoke-HiveEnroll {
  param(
    [string]$BaseUrl,
    [string]$Token,
    [string]$ClientId,
    [string]$ClientSecret
  )

  Require-Value -Name "EnrollmentToken" -Value $Token
  $headers = @{
    "CF-Access-Client-Id" = $ClientId
    "CF-Access-Client-Secret" = $ClientSecret
    "X-Hive-Enroll-Token" = $Token
  }
  Invoke-RestMethod -Method Post -Uri "$($BaseUrl.TrimEnd('/'))/v1/enroll" -Headers $headers -Body "{}" -ContentType "application/json"
}

function Write-RunScript {
  param(
    [string]$Path
  )

  @'
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-PlainText {
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

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content -LiteralPath (Join-Path $scriptRoot "config.json") -Raw | ConvertFrom-Json
$secrets = Import-Clixml -LiteralPath (Join-Path $scriptRoot "secrets.clixml")

$env:BUMBLEBEE_DEVICE_ID = [string]$config.device_id
$env:BUMBLEBEE_HMAC_KEY = Get-PlainText $secrets.HmacKey
$env:BUMBLEBEE_ACCESS_CLIENT_ID = Get-PlainText $secrets.AccessClientId
$env:BUMBLEBEE_ACCESS_CLIENT_SECRET = Get-PlainText $secrets.AccessClientSecret

$scanArgs = @(
  "scan",
  "--profile", [string]$config.scan_profile,
  "--max-duration", "5m",
  "--output", "http",
  "--http-url", [string]$config.ingest_url,
  "--http-auth", "hmac-sha256",
  "--http-hmac-key-env", "BUMBLEBEE_HMAC_KEY",
  "--http-gzip",
  "--http-header-env", "CF-Access-Client-Id=BUMBLEBEE_ACCESS_CLIENT_ID",
  "--http-header-env", "CF-Access-Client-Secret=BUMBLEBEE_ACCESS_CLIENT_SECRET",
  "--http-header-env", "X-Inventory-Device-Id=BUMBLEBEE_DEVICE_ID",
  "--device-id-env", "BUMBLEBEE_DEVICE_ID"
)

foreach ($root in @($config.scan_roots)) {
  $scanArgs += @("--root", [string]$root)
}

& $config.bumblebee_exe @scanArgs

exit $LASTEXITCODE
'@ | Set-Content -LiteralPath $Path -Encoding UTF8
}

Require-Value -Name "HiveBaseUrl" -Value $HiveBaseUrl
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

    if ($SkipEnroll) {
      Require-Value -Name "DeviceId" -Value $DeviceId
      Require-Value -Name "HmacKey" -Value $HmacKey
      $enrollment = [pscustomobject]@{
        device_id = $DeviceId
        hmac_key = $HmacKey
        ingest_path = "/v1/ingest"
      }
    } else {
      $enrollment = Invoke-HiveEnroll -BaseUrl $HiveBaseUrl -Token $EnrollmentToken -ClientId $AccessClientId -ClientSecret $AccessClientSecret
    }

    New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
    $config = [pscustomobject]@{
      hive_base_url = $HiveBaseUrl.TrimEnd("/")
      ingest_url = "$($HiveBaseUrl.TrimEnd('/'))$($enrollment.ingest_path)"
      device_id = [string]$enrollment.device_id
      bumblebee_exe = $installedExe
      interval_hours = $IntervalHours
      scan_profile = $ScanProfile
      scan_roots = @($ScanRoot)
    }
    $config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ConfigRoot "config.json") -Encoding UTF8

    [pscustomobject]@{
      HmacKey = Protect-String ([string]$enrollment.hmac_key)
      AccessClientId = Protect-String $AccessClientId
      AccessClientSecret = Protect-String $AccessClientSecret
    } | Export-Clixml -LiteralPath (Join-Path $ConfigRoot "secrets.clixml")

    $runScript = Join-Path $ConfigRoot "run-baseline.ps1"
    Write-RunScript -Path $runScript

    if (-not $SkipSchedule) {
      $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`""
      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)
      $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
      Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Run Bumblebee baseline inventory" -Force | Out-Null
    }

    [pscustomobject]@{
      installed_exe = $installedExe
      config_root = $ConfigRoot
      device_id = [string]$enrollment.device_id
      scheduled = -not $SkipSchedule
    } | ConvertTo-Json
  } finally {
    Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
