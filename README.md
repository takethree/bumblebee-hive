# Bumblebee Hive

Bumblebee Hive is a Cloudflare Worker receiver for Bumblebee inventory transport data.

The v0.1 receiver is intentionally small:

- protects `/v1/enroll` and `/v1/ingest` with Cloudflare Access service-token headers;
- accepts the Cloudflare Access JWT forwarded to the Worker after Access
  authenticates the request;
- verifies Bumblebee HMAC signatures against the exact raw request body;
- decompresses gzip only after HMAC verification;
- stores accepted raw batches in R2;
- stores device, batch, and run indexes in D1;
- queues accepted batches for later normalization.

It is designed to run in an operator-owned Cloudflare account. It does not require developer machines to hold object-storage credentials.

## Local Development

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Create the D1 schema with:

```powershell
wrangler d1 migrations apply bumblebee-hive --local
```

Production deployment requires real Cloudflare resource IDs and secrets in `wrangler.toml` / Wrangler secrets.

## Windows Bootstrapper

The self-service installer downloads Bumblebee, verifies the release checksum,
enrolls the endpoint with Hive, stores secrets with Windows DPAPI-backed
`Export-Clixml`, writes a scheduled-run wrapper, and optionally registers a
current-user scheduled task.

Dry-run the installer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-bumblebee.ps1 `
  -HiveBaseUrl https://hive.example.com `
  -AccessClientId $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID `
  -AccessClientSecret $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET `
  -WhatIf
```

For a real download install, pass the release base URL for the Bumblebee
release source you operate:

```powershell
-ReleaseBaseUrl https://github.com/<owner>/bumblebee/releases/download
```

The release must publish `checksums.txt` and a GoReleaser-style Windows asset
such as `bumblebee_0.1.2_windows_amd64.zip`. The installer uses the tag for the
URL and strips the leading `v` for the asset name.

Cloudflare Access setup must include a machine policy with action
`Service Auth` and a rule that includes the service token used by the
installer. If the installer reports that enrollment did not return JSON, check
whether Access returned a browser sign-in HTML page; that usually means the
policy is `Allow`, the token does not match the selected service token, or the
hostname/path is not the one protected by the application.

Use one `ENROLLMENT_TOKEN` per pilot or rollout wave, then rotate the Worker
secret after that wave completes:

```powershell
npx wrangler secret put ENROLLMENT_TOKEN
```

The generated wrapper passes gateway headers through Bumblebee's generic
`--http-header-env` support and uses Bumblebee HMAC for payload integrity.
The default generated scan profile is `baseline`; tests and bounded campaign
installs can pass `-ScanProfile project -ScanRoot <path>`.

Uninstall removes only local generated state: the scheduled task, wrapper,
DPAPI secrets, config, and installed `bumblebee.exe`. Remote Hive device
disable/revoke is a separate operator action.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-bumblebee.ps1 `
  -Uninstall `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot"
```

## Device Revocation

Hive can disable an enrolled device without changing the local installer state.
Set `ADMIN_TOKEN` as a Worker secret and call the admin endpoint through the
same Cloudflare Access Service Auth gate used by enroll and ingest:

```powershell
Invoke-WebRequest -Method Post `
  -Uri "https://hive.example.com/v1/admin/devices/<device-id>/disable" `
  -Headers @{
    "CF-Access-Client-Id" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID
    "CF-Access-Client-Secret" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET
    "X-Hive-Admin-Token" = $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
  }
```

Disabled devices are rejected on later ingest because their row no longer
matches the active-device lookup.

Wrangler D1 fallback:

```powershell
npx wrangler d1 execute bumblebee-hive --remote `
  --command "UPDATE devices SET disabled_at = datetime('now') WHERE device_id = '<device-id>' AND disabled_at IS NULL;"
```

## Operator Visibility

Hive exposes metadata-only JSON endpoints for operators. They are protected by
the same Cloudflare Access gate as ingest and also require `X-Hive-Admin-Token`.
Responses include `Cache-Control: no-store`.

```powershell
$headers = @{
  "CF-Access-Client-Id" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID
  "CF-Access-Client-Secret" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET
  "X-Hive-Admin-Token" = $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
}
```

Supported endpoints:

- `GET /v1/admin/overview`
- `GET /v1/admin/devices?status=active|disabled|all&limit=50&offset=0`
- `GET /v1/admin/devices/<device-id>`
- `GET /v1/admin/runs?device_id=<device-id>&status=complete&profile=baseline&limit=50&offset=0`

Example overview:

```powershell
Invoke-RestMethod -Uri "https://hive.example.com/v1/admin/overview" -Headers $headers
```

Example response:

```json
{
  "devices": { "total": 12, "active": 11, "disabled": 1 },
  "runs": {
    "total": 34,
    "complete": 32,
    "latest_received_at": "2026-05-26T19:45:00.000Z"
  },
  "batches": { "total": 36, "records": 12420 }
}
```

Example active-device list:

```powershell
Invoke-RestMethod `
  -Uri "https://hive.example.com/v1/admin/devices?status=active&limit=50&offset=0" `
  -Headers $headers
```

Example response:

```json
{
  "devices": [
    {
      "device_id": "device-redacted",
      "created_at": "2026-05-26T18:30:00.000Z",
      "disabled_at": null,
      "status": "active",
      "run_count": 3,
      "batch_count": 3,
      "record_count": 1200,
      "last_run": {
        "run_id": "run-redacted",
        "profile": "baseline",
        "status": "complete",
        "scanner_version": "v0.1.0",
        "received_at": "2026-05-26T19:45:00.000Z"
      }
    }
  ],
  "limit": 50,
  "offset": 0,
  "status": "active"
}
```

Example run list:

```powershell
Invoke-RestMethod `
  -Uri "https://hive.example.com/v1/admin/runs?profile=baseline&status=complete" `
  -Headers $headers
```

Example response:

```json
{
  "runs": [
    {
      "device_id": "device-redacted",
      "run_id": "run-redacted",
      "profile": "baseline",
      "status": "complete",
      "scanner_version": "v0.1.0",
      "received_at": "2026-05-26T19:45:00.000Z",
      "batch_count": 1,
      "record_count": 400
    }
  ],
  "limit": 50,
  "offset": 0
}
```

These endpoints intentionally do not expose raw inventory records, `summary_json`,
R2 object keys, body hashes, HMAC key material, Access credentials, local user
names, SIDs, hostnames, or profile paths. Use R2/D1 operator tooling separately
for break-glass forensic access to raw batches.
