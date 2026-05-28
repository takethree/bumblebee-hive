[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [Parameter(Mandatory = $true)]
  [string]$HiveBaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$DeviceId,
  [Parameter(Mandatory = $true)]
  [string]$AccessClientId,
  [Parameter(Mandatory = $true)]
  [string]$AccessClientSecret,
  [Parameter(Mandatory = $true)]
  [string]$AdminToken,
  [string]$Reason = "",
  [switch]$ConfirmPurge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-JsonBody {
  param([hashtable]$Body)
  $Body | ConvertTo-Json -Depth 5 -Compress
}

$base = $HiveBaseUrl.TrimEnd("/")
$encodedDeviceId = [uri]::EscapeDataString($DeviceId)
$dryRun = -not $ConfirmPurge.IsPresent
$uri = "$base/v1/admin/devices/$encodedDeviceId/purge?dry_run=$($dryRun.ToString().ToLowerInvariant())"
$headers = @{
  "CF-Access-Client-Id" = $AccessClientId
  "CF-Access-Client-Secret" = $AccessClientSecret
  "X-Hive-Admin-Token" = $AdminToken
}

$body = @{}
if ($ConfirmPurge.IsPresent) {
  if ([string]::IsNullOrWhiteSpace($Reason)) {
    throw "Reason is required when -ConfirmPurge is used."
  }
  $body.reason = $Reason
  $body.confirm_device_id = $DeviceId
}

if ($dryRun -or $PSCmdlet.ShouldProcess($DeviceId, "Purge Hive device data")) {
  Invoke-RestMethod `
    -Method Post `
    -Uri $uri `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (ConvertTo-JsonBody $body)
}
