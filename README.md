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

For a sequenced per-user Windows developer pilot, use
[docs/developer-rollout-runbook.md](docs/developer-rollout-runbook.md).

## Admin UI

Hive serves an operator dashboard at `/admin/`. The dashboard uses
Cloudflare Access for browser authentication and calls same-origin
`/v1/ui/admin/*` metadata routes. Browser code does not store or send
`X-Hive-Admin-Token`; that token remains limited to script/operator API calls
against `/v1/admin/*`.

Device detail views are recoverable at `/admin/devices/<device-id>`. Package
drill-down state is recoverable in the same admin route with query parameters
such as `selected_package`, `selected_ecosystem`, `selected_profile`, and
`selected_device`. The UI also preserves key filters in query parameters such
as `device_status`, `inventory_view`, `package_query`, `ecosystem`, `profile`,
`run_status`, `run_profile`, `normalization_status`,
`normalization_promoted`, `normalization_device`, and `normalization_run`.
Numbered table pages are recoverable through `device_page`, `inventory_page`,
`run_page`, `normalization_page`, and `detail_inventory_page`. The
UI defaults to 10 rows per page and lets operators choose 10, 25, 50, or 100
rows next to each paginated list. Non-default choices are recoverable through
`device_page_size`, `inventory_page_size`, `run_page_size`,
`normalization_page_size`, and `detail_inventory_page_size`. Auto-refresh
remains local browser state and is not encoded in the URL.

Configure these Worker values before using the UI:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

`ACCESS_TEAM_DOMAIN` is the Cloudflare Access team domain, for example
`example.cloudflareaccess.com`. `ACCESS_AUD` is the application AUD tag for
the protected Hive application. The UI routes validate the
`Cf-Access-Jwt-Assertion` header against the Access JWKS before returning
metadata.

The UI shows overview totals, health, devices, device detail, runs, and
metadata-only device lifecycle events. It does not expose raw inventory
records, `summary_json`, R2 object keys, HMAC material, Access credentials,
local usernames, SIDs, hostnames, or profile paths.

Device lifecycle write actions in the UI require an additional Hive-managed
allowlist after Access login:

```powershell
npx wrangler secret put UI_ADMIN_ACTION_EMAILS
npx wrangler secret put UI_ADMIN_ACTION_DOMAINS
```

Both values are comma-separated. `UI_ADMIN_ACTION_EMAILS` matches exact email
addresses and `UI_ADMIN_ACTION_DOMAINS` matches email domains. If neither is
configured, UI lifecycle write routes return `403`.

### Operator health

The dashboard includes a read-only health view backed by
`GET /v1/ui/admin/health`. Health is computed from active devices and the latest
run for one monitored profile. It is generic Worker configuration, not
deployment-specific code:

| Variable | Default | Meaning |
|---|---:|---|
| `HEALTH_PROFILE` | `baseline` | Scan profile to monitor. |
| `HEALTH_EXPECTED_CADENCE_HOURS` | `6` | Expected recurring interval shown to operators. |
| `HEALTH_STALE_HOURS` | `24` | Normal stale threshold for the latest complete monitored run. |
| `HEALTH_WEEKEND_GRACE_HOURS` | `72` | Stale threshold when the interval between latest complete run and now crosses a weekend. Use `0` to disable weekend grace. |

Health statuses:

- `healthy`: latest monitored-profile run is complete and within the active
  stale threshold.
- `stale`: latest complete monitored-profile run is older than the active
  stale threshold.
- `attention`: latest monitored-profile run exists but is not complete.
- `unknown`: active device has no monitored-profile run yet.

Disabled devices are excluded from health counts. Health responses contain
aggregate counts and metadata only; they do not expose raw inventory,
`summary_json`, R2 object keys, HMAC material, Access credentials, local
usernames, SIDs, hostnames, or profile paths.

## Retention

Hive stores accepted raw batches in R2 and metadata in D1. A scheduled Worker
cleanup runs every 6 hours and removes data older than the configured retention
window. The default retention window is 30 days; set `RETENTION_DAYS=0` to
disable cleanup. `RETENTION_DELETE_LIMIT` bounds the number of batch/run rows
processed in one cleanup pass and defaults to 100.

Cleanup deletes the R2 raw object before deleting the matching D1 `batches` row.
If an R2 delete fails, that D1 row is left in place so the next pass can retry.
Old `runs` rows are deleted only after they are older than the cutoff and have
no remaining batch rows.

Run a dry-run cleanup check with admin credentials:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://hive.example.com/v1/admin/retention/run?dry_run=true" `
  -Headers $headers
```

Run a manual cleanup:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://hive.example.com/v1/admin/retention/run" `
  -Headers $headers
```

Retention responses contain aggregate counts and the cutoff timestamp only. They
do not expose raw inventory, `summary_json`, R2 object keys, HMAC material,
Access credentials, local usernames, SIDs, hostnames, or profile paths.

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

## Device Lifecycle

Hive can disable or enable an enrolled device without changing the local
installer state. Set `ADMIN_TOKEN` as a Worker secret and call the admin
endpoint through the same Cloudflare Access Service Auth gate used by enroll
and ingest:

```powershell
Invoke-WebRequest -Method Post `
  -Uri "https://hive.example.com/v1/admin/devices/<device-id>/disable" `
  -Headers @{
    "CF-Access-Client-Id" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID
    "CF-Access-Client-Secret" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET
    "X-Hive-Admin-Token" = $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
  } `
  -Body (@{ reason = "developer offboarded" } | ConvertTo-Json) `
  -ContentType "application/json"
```

To re-enable the device:

```powershell
Invoke-WebRequest -Method Post `
  -Uri "https://hive.example.com/v1/admin/devices/<device-id>/enable" `
  -Headers @{
    "CF-Access-Client-Id" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID
    "CF-Access-Client-Secret" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET
    "X-Hive-Admin-Token" = $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
  } `
  -Body (@{ reason = "mistaken disable" } | ConvertTo-Json) `
  -ContentType "application/json"
```

Disabled devices are rejected on later ingest because their row no longer
matches the active-device lookup. Lifecycle actions write metadata-only audit
events to `device_lifecycle_events`.

The admin UI supports the same disable/enable actions from the device detail
panel when the operator's Access JWT identity matches
`UI_ADMIN_ACTION_EMAILS` or `UI_ADMIN_ACTION_DOMAINS`. The UI requires a short
reason and confirmation before sending the action, and it never sends
`X-Hive-Admin-Token`.

Wrangler D1 fallback for emergency disable only:

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
- `GET /v1/admin/normalization-jobs?status=complete&device_id=<device-id>&run_id=<run-id>&promoted_current=true&limit=50&offset=0`
- `GET /v1/admin/packages?query=<name>&ecosystem=npm&profile=baseline&view=package|summary|observations&limit=50&offset=0`
- `GET /v1/admin/packages/detail?name=<normalized-name>&ecosystem=npm&profile=baseline&device_id=<device-id>`
- `GET /v1/admin/devices/<device-id>/packages?profile=baseline&view=package|summary|observations&limit=50&offset=0`

List endpoints return additive pagination metadata alongside existing arrays:
`limit`, `offset`, `total`, `page`, `page_count`, and `has_more`.

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
  "total": 11,
  "page": 1,
  "page_count": 1,
  "has_more": false,
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
  "offset": 0,
  "total": 32,
  "page": 1,
  "page_count": 1,
  "has_more": false
}
```

Example normalization job list:

```powershell
Invoke-RestMethod `
  -Uri "https://hive.example.com/v1/admin/normalization-jobs?status=error&limit=50&offset=0" `
  -Headers $headers
```

Example response:

```json
{
  "normalization_jobs": [
    {
      "batch_id": "batch-redacted",
      "device_id": "device-redacted",
      "run_id": "run-redacted",
      "status": "error",
      "records_seen": 0,
      "packages_seen": 0,
      "findings_seen": 0,
      "promoted_current": false,
      "error": "[redacted-path]",
      "started_at": "2026-05-27T10:00:00.000Z",
      "completed_at": "2026-05-27T10:00:01.000Z"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 1,
  "page": 1,
  "page_count": 1,
  "has_more": false,
  "filters": {
    "status": "error",
    "device_id": null,
    "run_id": null,
    "promoted_current": null
  }
}
```

These endpoints intentionally do not expose raw inventory records, `summary_json`,
R2 object keys, body hashes, HMAC key material, Access credentials, local user
names, SIDs, hostnames, or profile paths. Use R2/D1 operator tooling separately
for break-glass forensic access to raw batches.

## Normalized Inventory

Hive normalizes accepted Bumblebee `package` and `finding` records from raw R2
batches into D1 through the `NORMALIZE_QUEUE` consumer. Raw batches remain the
source of truth; normalized tables are the operator query surface.

Normalization job visibility is read-only and metadata-only. It shows job
status, batch/device/run IDs, record/package/finding counts, whether current
inventory was promoted, a sanitized error string, and start/complete
timestamps. It does not expose raw batch content, R2 object keys, local paths,
retry/replay/delete controls, or queue mutation.

Current package state is promoted only after Hive sees a matching
`scan_summary.status=complete`. `baseline` and `project` runs can promote
current package state. `deep` runs are kept as evidence and finding data but do
not retire or replace current inventory.

Package responses default to `view=summary`, grouped by device ID, profile,
ecosystem, normalized package name, and version. Summary rows include an
occurrence count, latest observed time, latest run ID, and unique source
categories such as package managers, source types, and root kinds.
`view=package` groups by package family and includes `version_count`,
`total_occurrence_count`, source category summaries, latest observed time, and
`versions[]` details for each version. Use `view=observations` when
troubleshooting needs the current row-level package observations behind a
summary.

Package drill-down uses exact `name` plus `ecosystem` matching against current
normalized package state. The detail response includes package summary,
version summary, affected-device summary, occurrence counts, source categories,
and latest observed metadata. It is intentionally not a raw observation browser.

The admin UI explicitly defaults to the package-family view and stores the
operator's selected grouping mode in browser local storage. The API default
stays `view=summary` for compatibility with script callers.
The UI shows exact numbered pagination for devices, runs, global inventory, and
selected-device package inventory. Page changes update the URL with
recoverable page parameters while filter and per-list page-size changes reset
the affected table to page one. The browser UI defaults to 10 rows per page;
script callers can continue to pass explicit `limit` and `offset` values.

Package responses include controlled fields such as ecosystem, package name,
normalized name, version, source type, package manager, profile, device ID, run
ID, confidence, and observed time. They do not expose raw payload JSON,
`summary_json`, R2 object keys, body hashes, HMAC material, hostnames, usernames,
SIDs, `source_file`, `project_path`, or local profile paths.

## Pilot Verification

Use `scripts\verify-bumblebee-pilot.ps1` on a pilot Windows host after the
bootstrapper has installed Bumblebee, enrolled Hive, and registered the scheduled
task. The verifier reads the local Bumblebee config, decrypts only the local
DPAPI-protected secrets needed for the check, calls Hive admin metadata
endpoints, and emits redacted JSON.

The verifier intentionally does not print secrets, raw inventory, raw HTTP
payloads, raw device IDs, usernames, SIDs, hostnames, full profile paths, R2
object keys, or `summary_json`.

Check local state and Hive admin visibility without sending inventory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-bumblebee-pilot.ps1 `
  -Mode CheckOnly `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot" `
  -AdminSecretsPath ".local\deployment-secrets.clixml"
```

Run the wrapper directly and wait for a fresh completed Hive run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-bumblebee-pilot.ps1 `
  -Mode Direct `
  -WaitSeconds 180
```

Trigger the scheduled task and wait for a fresh completed Hive run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-bumblebee-pilot.ps1 `
  -Mode Scheduled `
  -WaitSeconds 240
```

A successful `CheckOnly` result proves:

- local config, local DPAPI secrets, wrapper script, and binary are present;
- `bumblebee.exe selftest` exits `0`;
- the scheduled task exists and its last result is `0`;
- Hive admin overview, device, and run metadata endpoints return `200`;
- admin responses use `Cache-Control: no-store`;
- forbidden raw-data fields are absent from admin responses.

A successful `Direct` or `Scheduled` result additionally proves that a fresh
`complete` run for the configured device/profile appeared in Hive after the
trigger. The verifier uses the configured raw device ID only as an internal
query filter and does not print it.

If verification fails:

- `missing_config`, `local_secrets_present`, or `run_script_present` failures
  usually mean the bootstrapper did not finish or was run with different roots.
- `selftest_failed` means the installed Bumblebee binary should be repaired
  before debugging Hive.
- `admin_endpoint_failed_*` usually means Cloudflare Access service auth,
  `ADMIN_TOKEN`, or the Hive deployment is not configured for this operator.
- `scheduled_task_failed` or `scheduled_task_timeout` means inspect the Windows
  scheduled task history and wrapper exit code on the host.
- `fresh_hive_run_not_observed` means the local run completed but Hive did not
  expose a newer completed run before the timeout; check Access/HMAC ingest,
  Worker logs, and D1 run rows.
