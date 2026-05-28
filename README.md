# Bumblebee Hive

Bumblebee Hive is a Cloudflare Worker receiver and operator console for
Bumblebee inventory transport data.

It answers the deployment-side question for Bumblebee: once developer
endpoints collect read-only package, extension, developer-tool, and exposure
metadata, where can those signed batches go, how can operators see the current
state, and how can enrolled devices refresh the exposure catalog from one
central source?

Hive is designed to run in an operator-owned Cloudflare account. Developer
machines do not need object-storage, database, or admin credentials.

## Scope

- Cloudflare Worker app for Bumblebee enrollment, ingest, catalog sync, and
  operator metadata views.
- Cloudflare Access service-token protection for device enrollment, ingest,
  admin scripts, and catalog reads.
- Per-device HMAC keys for payload integrity; gzip is decompressed only after
  HMAC verification against the exact raw request body.
- R2 storage for accepted raw batches and D1 storage for device, run, batch,
  normalized inventory, finding, catalog, lifecycle, and operator metadata.
- Queue-backed normalization from raw batches into queryable metadata tables.
- Metadata-only admin UI at `/admin/`.
- Windows bootstrapper scripts for per-user Bumblebee enrollment and scheduled
  managed or upstream-compatible Bumblebee runs.

Hive is not a SIEM, EDR, identity-management system, raw forensic browser, or
general device-management platform. Break-glass access to raw R2/D1 data should
stay outside the normal operator UI.

## Architecture

| Part | Purpose |
|---|---|
| `/v1/enroll` | Enroll a Bumblebee device and issue its encrypted HMAC key. |
| `/v1/ingest` | Accept signed managed Bumblebee transport batches behind Cloudflare Access. |
| `/v1/compat/ingest/<device-id>` | Accept stock upstream Bumblebee HTTP/HMAC batches without custom headers. |
| `RAW_BATCHES` R2 bucket | Store accepted raw request bodies. |
| `DB` D1 database | Store device, run, batch, current inventory, finding, catalog, lifecycle, and admin metadata. |
| `NORMALIZE_QUEUE` | Normalize accepted batches asynchronously. |
| `/admin/` | Browser operator dashboard. |
| `/v1/ui/admin/*` | Browser-safe, Access-authenticated admin metadata routes. |
| `/v1/admin/*` | Script/operator admin routes guarded by Access plus `X-Hive-Admin-Token`. |
| `/v1/catalog/current` | Device catalog bundle download endpoint. |

Raw batches remain the source of truth. Normalized D1 tables are the operator
query surface.

## Quick Start

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Create the local D1 schema:

```powershell
wrangler d1 migrations apply bumblebee-hive --local
```

Production deployment requires real Cloudflare resource IDs and secrets in
`wrangler.toml` and Wrangler secrets. For a sequenced per-user Windows
developer pilot, use
[docs/developer-rollout-runbook.md](docs/developer-rollout-runbook.md).

## Use With Bumblebee

Hive supports two Bumblebee paths:

| Mode | Bumblebee source | Use when | Ingest path | What you get |
|---|---|---|---|---|
| Managed branch | [bradmb/bumblebee](https://github.com/bradmb/bumblebee) | You use a Bumblebee build with `bumblebee hive join`, `hive catalog sync`, and `hive run`. | `/v1/ingest` | Cloudflare Access service-token ingest, Hive-managed catalog sync/cache, and the Windows compatibility-layer scanner when using the Windows branch. |
| Upstream HTTP | [perplexityai/bumblebee](https://github.com/perplexityai/bumblebee) | You use stock upstream Bumblebee with its generic HTTP sink. | `/v1/compat/ingest/<device-id>` | HMAC/gzip ingest into Hive, raw batch storage, normalization, admin UI, and findings from records the upstream scanner submits. |

The upstream HTTP path intentionally does not require Cloudflare Access
service-token headers on the ingest request because upstream Bumblebee cannot
send arbitrary static HTTP headers. Its auth boundary is the per-device HMAC
signature. Keep `/v1/enroll`, `/v1/ingest`, `/v1/admin/*`, `/v1/ui/admin/*`,
and `/v1/catalog/current` protected by Access.

Upstream mode is ingest compatibility, not full feature parity with the
managed branch. Hive-managed catalog sync/cache and the Windows compatibility
layer require the managed branch. Operators who use upstream Bumblebee can
still distribute an exposure catalog separately and pass it to upstream
Bumblebee with its normal `--exposure-catalog` flag.

Stock upstream Bumblebee can post to Hive with:

```powershell
$env:BUMBLEBEE_HIVE_DEVICE_ID = "<device-id-from-enrollment>"
$env:BUMBLEBEE_HIVE_HMAC_KEY = "<hmac-key-from-enrollment>"

bumblebee scan `
  --profile baseline `
  --output http `
  --http-url "https://hive.example.com/v1/compat/ingest/$env:BUMBLEBEE_HIVE_DEVICE_ID" `
  --http-auth hmac-sha256 `
  --http-hmac-key-env BUMBLEBEE_HIVE_HMAC_KEY `
  --http-gzip `
  --device-id-env BUMBLEBEE_HIVE_DEVICE_ID
```

## Deploy

Hive expects these Cloudflare bindings:

| Binding | Type | Purpose |
|---|---|---|
| `DB` | D1 | Metadata and normalized inventory. |
| `RAW_BATCHES` | R2 | Accepted raw Bumblebee batches. |
| `NORMALIZE_QUEUE` | Queue | Async batch normalization. |
| `ASSETS` | Worker assets | Admin UI assets. |

Core secrets:

```powershell
npx wrangler secret put ACCESS_CLIENT_ID
npx wrangler secret put ACCESS_CLIENT_SECRET
npx wrangler secret put ENROLLMENT_TOKEN
npx wrangler secret put HIVE_KEY_ENCRYPTION_KEY
npx wrangler secret put ADMIN_TOKEN
```

Admin UI secrets:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

`ACCESS_TEAM_DOMAIN` is the Cloudflare Access team domain, for example
`example.cloudflareaccess.com`. `ACCESS_AUD` is the application AUD tag for the
protected Hive application.

UI lifecycle write actions also require at least one allowlist secret:

```powershell
npx wrangler secret put UI_ADMIN_ACTION_EMAILS
npx wrangler secret put UI_ADMIN_ACTION_DOMAINS
```

Both values are comma-separated. `UI_ADMIN_ACTION_EMAILS` matches exact email
addresses and `UI_ADMIN_ACTION_DOMAINS` matches email domains. If neither is
configured, UI lifecycle write routes return `403`.

## Device Enrollment And Ingest

Device enrollment and ingest are protected by Cloudflare Access Service Auth.
Access authenticates the service-token headers, forwards the Access JWT to the
Worker, and Hive validates device state before accepting data.

Enrollment creates a device row and returns the local material Bumblebee needs
for later signed ingest. Ingest verifies the per-device HMAC against the exact
raw request body, then decompresses gzip if present, stores the accepted raw
batch in R2, indexes device/run/batch metadata in D1, and queues the batch for
normalization.

Device enrollment accepts an optional JSON `environment` value of `production`
or `test`. Omitted values are stored as `production`. Admin metadata views
default to `environment=production` so local smoke tests and installer
validation devices do not pollute operator views.

Enrollment responses include both `ingest_path` for managed branch clients and
`upstream_ingest_path` for stock upstream Bumblebee HTTP/HMAC clients.

## Admin UI

Hive serves the operator dashboard at `/admin/`. The dashboard uses Cloudflare
Access browser authentication and calls same-origin `/v1/ui/admin/*` metadata
routes. Browser code does not store or send `X-Hive-Admin-Token`; that token is
limited to script/operator API calls against `/v1/admin/*`.

The UI shows overview totals, attention, health, exposure findings, devices,
device detail, runs, normalized inventory, catalog status, and metadata-only
device lifecycle events. It does not expose raw inventory records,
`summary_json`, R2 object keys, HMAC material, Access credentials, local
usernames, SIDs, hostnames, or profile paths.

Device detail views are recoverable at `/admin/devices/<device-id>`. Filters,
drill-down state, selected inventory grouping, selected environment, numbered
pages, and per-list page sizes are encoded in query parameters so operators can
refresh or share the current view. Auto-refresh remains local browser state.

The UI defaults to 10 rows per paginated list and lets operators choose 10, 25,
50, or 100 rows next to each list. The environment selector supports
`production`, `test`, and `all`.

## Operator Workflows

### Health

The dashboard health view is backed by `GET /v1/ui/admin/health`. Health is
computed from active devices and the latest run for one monitored profile.

| Variable | Default | Meaning |
|---|---:|---|
| `HEALTH_PROFILE` | `baseline` | Scan profile to monitor. |
| `HEALTH_EXPECTED_CADENCE_HOURS` | `6` | Expected recurring interval shown to operators. |
| `HEALTH_STALE_HOURS` | `24` | Normal stale threshold for the latest complete monitored run. |
| `HEALTH_WEEKEND_GRACE_HOURS` | `72` | Stale threshold when the interval between latest complete run and now crosses a weekend. Use `0` to disable weekend grace. |

Health statuses are `healthy`, `stale`, `attention`, and `unknown`. Disabled
devices are excluded from health counts.

### Attention

The dashboard attention queue is backed by `GET /v1/ui/admin/attention`.
Script/operator callers can use `GET /v1/admin/attention`. The queue is
computed from active devices, monitored-profile run health, and the latest
normalization job for the latest complete monitored-profile run.

Attention supports `severity=all|critical|warning`, `reason=<reason>`, `limit`,
and `offset`.

| Variable | Default | Meaning |
|---|---:|---|
| `NORMALIZATION_PROCESSING_STALE_MINUTES` | `30` | Age threshold before an in-progress normalization job needs operator attention. |

Attention reasons:

- `latest_run_not_complete`: critical.
- `latest_complete_run_too_old`: warning.
- `no_monitored_profile_run`: warning.
- `normalization_missing`: warning.
- `normalization_error`: critical.
- `normalization_processing_stale`: critical.
- `normalization_not_promoted`: warning.

### Findings

The findings view is backed by `GET /v1/ui/admin/findings`. Script/operator
callers can use `GET /v1/admin/findings`. Findings are served from normalized
Bumblebee `record_type=finding` data in D1 and default to all historical
findings, newest first.

Findings support `severity`, `catalog_id`, `ecosystem`, `query`, `device_id`,
`profile`, `run_id`, `limit`, and `offset`.

Finding rows expose only operator-triage metadata: device ID, run ID, record
ID, profile, finding type, severity, catalog ID/name, ecosystem, package name,
normalized package name, version, root kind, source type, confidence, sanitized
evidence text, and received time.

### Inventory

Hive normalizes accepted Bumblebee `package` and `finding` records from raw R2
batches into D1 through the `NORMALIZE_QUEUE` consumer.

Current package state is promoted only after Hive sees a matching
`scan_summary.status=complete`. `baseline` and `project` runs can promote
current package state. `deep` runs are kept as evidence and finding data but do
not retire or replace current inventory.

Package responses default to `view=summary`, grouped by device ID, profile,
ecosystem, normalized package name, and version. `view=package` groups by
package family and includes `version_count`, `total_occurrence_count`, source
category summaries, latest observed time, and `versions[]` details.
`view=observations` returns the current row-level observations behind a
summary.

The admin UI defaults to the package-family view and stores the selected
grouping mode in browser local storage. The script API default remains
`view=summary` for compatibility.

### Retention

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

### Device Lifecycle And Purge

Hive can disable or enable an enrolled device without changing the local
installer state. Disabled devices are rejected on later ingest because their
row no longer matches the active-device lookup. Lifecycle actions write
metadata-only audit events to `device_lifecycle_events`.

The admin UI supports disable/enable actions from the device detail panel when
the operator's Access JWT identity matches `UI_ADMIN_ACTION_EMAILS` or
`UI_ADMIN_ACTION_DOMAINS`. The UI requires a short reason and confirmation
before sending the action, and it never sends `X-Hive-Admin-Token`.

Operators can also purge a specific test or stale disabled device through a
guarded admin endpoint. Purge is intended for disposable smoke devices and
retired endpoints after local uninstall/disable, not routine lifecycle control.

Dry-run first:

```powershell
.\scripts\invoke-device-purge.ps1 `
  -HiveBaseUrl https://hive.example.com `
  -DeviceId "<device-id>" `
  -AccessClientId $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID `
  -AccessClientSecret $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET `
  -AdminToken $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
```

Confirm the purge only after reviewing the aggregate candidate counts:

```powershell
.\scripts\invoke-device-purge.ps1 `
  -HiveBaseUrl https://hive.example.com `
  -DeviceId "<device-id>" `
  -AccessClientId $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID `
  -AccessClientSecret $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET `
  -AdminToken $env:BUMBLEBEE_HIVE_ADMIN_TOKEN `
  -Reason "remove disposable smoke-test device" `
  -ConfirmPurge
```

The underlying endpoint is
`POST /v1/admin/devices/<device-id>/purge?dry_run=true|false`. Destructive
runs require `confirm_device_id` to match the route device ID and require a
non-empty reason. Production devices must be disabled before they can be purged;
test devices may be purged directly. Purge deletes the device row, lifecycle
events, runs, batches, normalized inventory, findings, and matching raw R2
objects. If any raw object delete fails, Hive returns `ok:false` and leaves D1
metadata in place for a later retry.

Emergency D1 fallback for disable only:

```powershell
npx wrangler d1 execute bumblebee-hive --remote `
  --command "UPDATE devices SET disabled_at = datetime('now') WHERE device_id = '<device-id>' AND disabled_at IS NULL;"
```

### Catalog Publishing

Hive can publish the current Bumblebee exposure catalog to enrolled devices.
Script/operator callers use `POST /v1/admin/catalog/current` with Cloudflare
Access Service Auth headers and `X-Hive-Admin-Token`.

```json
{
  "source": "upstream-threat-intel",
  "files": [
    {
      "path": "example-advisory.json",
      "content": "{\"schema_version\":\"0.1.0\",\"entries\":[]}"
    }
  ]
}
```

Hive validates every file as a Bumblebee exposure catalog before promoting it,
stores file hashes and release metadata in D1, and serves the active bundle from
`GET /v1/catalog/current` to active enrolled devices. Device catalog reads use
the same Access service headers plus `X-Inventory-Device-Id`; disabled or
unknown devices are rejected.

Hive can also sync directly from an upstream Bumblebee `threat_intel`
directory. Trigger it manually with:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://hive.example.com/v1/admin/catalog/sync-upstream" `
  -Headers $headers
```

Set `CATALOG_UPSTREAM_SYNC_ENABLED=true` to run the same sync from the
scheduled Worker. By default, Hive reads the public
`perplexityai/bumblebee/threat_intel` directory through GitHub's repository
contents API.

| Variable | Default | Purpose |
|---|---|---|
| `CATALOG_UPSTREAM_SYNC_ENABLED` | unset | Enables scheduled upstream catalog sync when `true`, `1`, or `yes`. |
| `CATALOG_UPSTREAM_CONTENTS_URL` | `https://api.github.com/repos/perplexityai/bumblebee/contents/threat_intel?ref=main` | Contents API URL for the upstream catalog directory. |
| `CATALOG_UPSTREAM_SOURCE` | `perplexityai/bumblebee/threat_intel` | Source label stored on the promoted catalog release. |
| `CATALOG_UPSTREAM_FILE_LIMIT` | `100` | Maximum upstream JSON files to fetch per sync. |

## Windows Bootstrapper

The self-service installer downloads Bumblebee, verifies the release checksum,
enrolls the endpoint with Hive, writes local `config.json` and `secrets.json`,
writes a scheduled wrapper, and optionally registers a current-user scheduled
task. It defaults to `-BumblebeeMode ManagedHive`, which expects the managed
Bumblebee branch and generates a `bumblebee hive run` wrapper.

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

The generated wrapper runs `bumblebee hive run` with the configured Hive
config, secrets, and cache roots. Bumblebee uses HMAC for payload integrity.
The default generated scan profile is `baseline`; tests and bounded campaign
installs can pass `-Environment test -ScanProfile project -ScanRoot <path>`.
The installer reuses an existing local Hive identity by default when rerun.

Use `-BumblebeeMode UpstreamHttp` for stock upstream Bumblebee. In that mode,
the installer calls Hive enrollment itself, writes the upstream-compatible
ingest path, and generates a wrapper that runs `bumblebee scan --output http`
with `--http-auth hmac-sha256`, `--http-gzip`, and `--device-id-env`. It does
not use `bumblebee hive join` or `bumblebee hive run`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-bumblebee.ps1 `
  -BumblebeeMode UpstreamHttp `
  -HiveBaseUrl https://hive.example.com `
  -AccessClientId $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID `
  -AccessClientSecret $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET `
  -EnrollmentToken $env:BUMBLEBEE_HIVE_ENROLLMENT_TOKEN `
  -SkipDownload `
  -BumblebeeExePath .\bumblebee.exe
```

Use `-SkipDownload -BumblebeeExePath` when your upstream Bumblebee source does
not publish a Windows release asset in the GoReleaser zip layout expected by
this installer.

Uninstall removes only local generated state: the scheduled task, wrapper,
Hive secrets, config, and installed `bumblebee.exe`. Remote Hive device
disable/revoke/purge is a separate operator action.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-bumblebee.ps1 `
  -Uninstall `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot"
```

## Pilot Verification

Use `scripts\verify-bumblebee-pilot.ps1` on a pilot Windows host after the
bootstrapper has installed Bumblebee, enrolled Hive, and registered the
scheduled task. The verifier reads local Hive config and `secrets.json`, calls
Hive admin metadata endpoints, and emits redacted JSON.

Check local state and Hive admin visibility without sending inventory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-bumblebee-pilot.ps1 `
  -Mode CheckOnly `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot" `
  -AdminSecretsPath ".local\deployment-secrets.clixml" `
  -WorkersDevUrl "https://bumblebee-hive.<account-subdomain>.workers.dev"
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
  -WaitSeconds 240 `
  -WorkersDevUrl "https://bumblebee-hive.<account-subdomain>.workers.dev"
```

A successful `CheckOnly` result proves local config/secrets, wrapper script,
cache root, binary, selftest, scheduled task state, admin metadata routes,
dashboard assets, workers.dev lockout, and forbidden raw-field redaction. A
successful `Direct` or `Scheduled` result additionally proves that a fresh
`complete` run and a fresh complete normalization job became visible for the
same device.

The verifier intentionally does not print secrets, raw inventory, raw HTTP
payloads, raw device IDs, usernames, SIDs, hostnames, full profile paths, R2
object keys, or `summary_json`.

<details>
<summary>Verifier failure hints</summary>

- `missing_config`, `local_hive_secrets_present`, or `run_script_present`
  usually mean the bootstrapper did not finish or was run with different roots.
- `run_script_uses_hive_run`, `configured_base_url_present`,
  `configured_ingest_path`, or `configured_environment` usually mean the host
  still has legacy direct-ingest installer state or a hand-edited config.
- `selftest_failed` means the installed Bumblebee binary should be repaired
  before debugging Hive.
- `admin_endpoint_failed_*` usually means Cloudflare Access service auth,
  `ADMIN_TOKEN`, or the Hive deployment is not configured for this operator.
- `scheduled_task_failed` or `scheduled_task_timeout` means inspect the Windows
  scheduled task history and wrapper exit code on the host.
- `fresh_hive_run_not_observed` means the local run completed but Hive did not
  expose a newer completed run before the timeout; check Access/HMAC ingest,
  Worker logs, and D1 run rows.
- `fresh_normalization_not_observed` means ingest completed but the queue
  consumer did not expose a fresh complete normalization job before the timeout;
  check Worker queue delivery, consumer logs, and the `normalization_jobs` D1
  rows.

</details>

## API Reference

Device ingest endpoints:

- `POST /v1/ingest`: managed branch ingest; protected by Cloudflare Access service-token headers, `X-Inventory-Device-Id`, and per-device HMAC.
- `POST /v1/compat/ingest/<device-id>`: upstream-compatible ingest; protected by per-device HMAC and does not require custom static headers.

Admin script endpoints are protected by the same Cloudflare Access gate as
managed ingest and also require `X-Hive-Admin-Token`. Responses include
`Cache-Control: no-store`.

```powershell
$headers = @{
  "CF-Access-Client-Id" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID
  "CF-Access-Client-Secret" = $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET
  "X-Hive-Admin-Token" = $env:BUMBLEBEE_HIVE_ADMIN_TOKEN
}
```

Supported script/operator endpoints:

- `GET /v1/admin/overview?environment=production|test|all`
- `GET /v1/admin/attention?environment=production|test|all&severity=all|critical|warning&reason=<reason>&limit=10&offset=0`
- `GET /v1/admin/findings?environment=production|test|all&severity=critical&catalog_id=<catalog-id>&ecosystem=npm&query=<package>&device_id=<device-id>&profile=baseline&run_id=<run-id>&limit=10&offset=0`
- `GET /v1/admin/devices?environment=production|test|all&status=active|disabled|all&limit=50&offset=0`
- `GET /v1/admin/devices/<device-id>`
- `POST /v1/admin/devices/<device-id>/disable`
- `POST /v1/admin/devices/<device-id>/enable`
- `POST /v1/admin/devices/<device-id>/purge?dry_run=true|false`
- `GET /v1/admin/runs?environment=production|test|all&device_id=<device-id>&status=complete&profile=baseline&limit=50&offset=0`
- `GET /v1/admin/normalization-jobs?environment=production|test|all&status=complete&device_id=<device-id>&run_id=<run-id>&promoted_current=true&limit=50&offset=0`
- `GET /v1/admin/packages?environment=production|test|all&query=<name>&ecosystem=npm&profile=baseline&view=package|summary|observations&limit=50&offset=0`
- `GET /v1/admin/packages/detail?environment=production|test|all&name=<normalized-name>&ecosystem=npm&profile=baseline&device_id=<device-id>`
- `GET /v1/admin/devices/<device-id>/packages?environment=production|test|all&profile=baseline&view=package|summary|observations&limit=50&offset=0`
- `POST /v1/admin/retention/run?dry_run=true|false`
- `POST /v1/admin/catalog/current`
- `POST /v1/admin/catalog/sync-upstream`

List endpoints return additive pagination metadata alongside existing arrays:
`limit`, `offset`, `total`, `page`, `page_count`, and `has_more`.

These endpoints intentionally do not expose raw inventory records,
`summary_json`, R2 object keys, body hashes, HMAC key material, Access
credentials, local usernames, SIDs, hostnames, or profile paths.

<details>
<summary>Example admin responses</summary>

Example overview:

```powershell
Invoke-RestMethod -Uri "https://hive.example.com/v1/admin/overview" -Headers $headers
```

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

Example attention queue:

```json
{
  "config": {
    "profile": "baseline",
    "expected_cadence_hours": 6,
    "stale_hours": 24,
    "weekend_grace_hours": 72,
    "normalization_processing_stale_minutes": 30
  },
  "counts": {
    "total": 3,
    "critical": 1,
    "warning": 2,
    "reasons": {
      "latest_run_not_complete": 1,
      "latest_complete_run_too_old": 0,
      "no_monitored_profile_run": 0,
      "normalization_missing": 1,
      "normalization_error": 1,
      "normalization_processing_stale": 0,
      "normalization_not_promoted": 0
    }
  },
  "attention": [
    {
      "device_id": "device-redacted",
      "severity": "critical",
      "reason": "normalization_error",
      "profile": "baseline",
      "observed_at": "2026-05-27T10:00:01.000Z",
      "age_hours": 0.1,
      "stale_after_hours": 24,
      "run": {
        "run_id": "run-redacted",
        "status": "complete",
        "scanner_version": "v0.1.0",
        "received_at": "2026-05-27T09:55:00.000Z",
        "completed_run_id": "run-redacted",
        "completed_received_at": "2026-05-27T09:55:00.000Z"
      },
      "normalization_job": {
        "status": "error",
        "records_seen": 0,
        "packages_seen": 0,
        "findings_seen": 0,
        "promoted_current": false,
        "error": "[redacted-path]",
        "started_at": "2026-05-27T10:00:00.000Z",
        "completed_at": "2026-05-27T10:00:01.000Z"
      }
    }
  ],
  "limit": 10,
  "offset": 0,
  "total": 1,
  "page": 1,
  "page_count": 1,
  "has_more": false,
  "filters": {
    "severity": "critical",
    "reason": null
  }
}
```

Example findings list:

```json
{
  "counts": {
    "total": 1,
    "severities": {
      "critical": 1
    }
  },
  "findings": [
    {
      "device_id": "device-redacted",
      "run_id": "run-redacted",
      "record_id": "finding-redacted",
      "profile": "baseline",
      "finding_type": "package_exposure",
      "severity": "critical",
      "catalog_id": "advisory-redacted",
      "catalog_name": "example advisory",
      "ecosystem": "npm",
      "package_name": "left-pad",
      "normalized_name": "left-pad",
      "version": "1.3.0",
      "root_kind": "project_root",
      "source_type": "package-lock",
      "confidence": "high",
      "evidence": "found in [redacted-path]",
      "received_at": "2026-05-27T10:00:01.000Z"
    }
  ],
  "limit": 10,
  "offset": 0,
  "total": 1,
  "page": 1,
  "page_count": 1,
  "has_more": false
}
```

Example active-device list:

```json
{
  "devices": [
    {
      "device_id": "device-redacted",
      "created_at": "2026-05-26T18:30:00.000Z",
      "disabled_at": null,
      "environment": "production",
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
  "status": "active",
  "environment": "production"
}
```

</details>

## Security

Please report vulnerabilities privately through GitHub Security Advisories. See
[SECURITY.md](SECURITY.md).

## Contributing

Development and pull-request guidance lives in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
