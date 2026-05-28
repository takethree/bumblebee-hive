# Developer Rollout Runbook

This runbook is the operator path for a per-user Bumblebee pilot that sends
inventory to Hive. It assumes the Hive Worker, Cloudflare Access application,
D1 database, and R2 bucket already exist.

This is not a broad fleet rollout recipe. It is a careful first-wave path for
developer machines using the current Windows per-user pilot shape:

- install root: `%LOCALAPPDATA%\Programs\Bumblebee`
- config root: `%APPDATA%\Bumblebee`
- scheduled task: `Bumblebee Baseline Pilot`
- scan profile: `baseline`
- release version: `v0.1.2`

Do not put real Access secrets, enrollment tokens, admin tokens, device IDs,
hostnames, usernames, SIDs, profile paths, or raw inventory into tickets,
commit messages, docs, or receipts.

## Operator Inputs

Prepare these values outside the repo:

| Value | Purpose |
| --- | --- |
| `HIVE_BASE_URL` | Public Hive origin protected by Cloudflare Access, for example `https://hive.example.com`. |
| `RELEASE_BASE_URL` | Operator-owned Bumblebee GitHub release download base, for example `https://github.com/<owner>/bumblebee/releases/download`. |
| `ACCESS_CLIENT_ID` | Cloudflare Access service-token client ID. |
| `ACCESS_CLIENT_SECRET` | Cloudflare Access service-token client secret. |
| `ENROLLMENT_TOKEN` | Hive enrollment token for this pilot or rollout wave. |
| `ADMIN_TOKEN` | Hive admin token used only by operator verification. |

Use one `ENROLLMENT_TOKEN` per pilot or rollout wave. Rotate the Worker secret
after the wave completes.

## Preflight

Confirm the release exists and includes Windows zip assets plus checksums:

```powershell
gh release view v0.1.2 --repo <owner>/bumblebee `
  --json tagName,isDraft,isPrerelease,assets
```

The release must be published, not a draft, and must include:

- `bumblebee_0.1.2_windows_amd64.zip`
- `bumblebee_0.1.2_windows_arm64.zip`
- `checksums.txt`

Confirm the Cloudflare Access application has a machine policy with action
`Service Auth` for the service token used by this runbook. A normal `Allow`
policy can return browser sign-in HTML to the installer instead of Hive JSON.

## Dry Run

From the Hive repo, dry-run the installer with placeholders first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\install-bumblebee.ps1 `
  -HiveBaseUrl $env:HIVE_BASE_URL `
  -ReleaseBaseUrl $env:RELEASE_BASE_URL `
  -AccessClientId $env:ACCESS_CLIENT_ID `
  -AccessClientSecret $env:ACCESS_CLIENT_SECRET `
  -EnrollmentToken $env:ENROLLMENT_TOKEN `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -CacheRoot "$env:LOCALAPPDATA\Bumblebee\catalog-cache" `
  -TaskName "Bumblebee Baseline Pilot" `
  -WhatIf
```

The dry run should show the intended install target and should not write local
state, enroll a device, or register a scheduled task.

## Install One Developer Host

Run the real installer on the developer host:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\install-bumblebee.ps1 `
  -HiveBaseUrl $env:HIVE_BASE_URL `
  -ReleaseBaseUrl $env:RELEASE_BASE_URL `
  -AccessClientId $env:ACCESS_CLIENT_ID `
  -AccessClientSecret $env:ACCESS_CLIENT_SECRET `
  -EnrollmentToken $env:ENROLLMENT_TOKEN `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -CacheRoot "$env:LOCALAPPDATA\Bumblebee\catalog-cache" `
  -TaskName "Bumblebee Baseline Pilot"
```

The installer downloads the Windows release asset, verifies `checksums.txt`,
runs `bumblebee.exe selftest`, enrolls the endpoint with `bumblebee hive join`,
writes local Hive `config.json` and `secrets.json`, writes the `bumblebee hive
run` wrapper, and registers the current-user scheduled task. Rerunning the
installer reuses the existing local Hive identity unless the local config is
removed first.

## Verify Without Sending Inventory

Run `CheckOnly` first:

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

`CheckOnly` validates local Hive config, local Hive secret material, wrapper
script, expected binary, cache root, device ID presence, `/v1/ingest` target
shape, device environment, scan profile, `bumblebee.exe selftest`,
scheduled-task presence, last task result, Hive admin metadata reachability for
the configured environment, dashboard asset availability, normalization-job
visibility, device-detail recent normalization visibility, and optional
workers.dev disabled posture. It emits redacted JSON and does not send
inventory.

## Verify A Fresh Run

When the operator is ready to prove end-to-end ingest, trigger the scheduled
task and wait for Hive metadata to show a fresh completed run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-bumblebee-pilot.ps1 `
  -Mode Scheduled `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot" `
  -AdminSecretsPath ".local\deployment-secrets.clixml" `
  -WaitSeconds 240 `
  -WorkersDevUrl "https://bumblebee-hive.<account-subdomain>.workers.dev"
```

Use `Scheduled` for pilot proof. Use `Direct` only when troubleshooting the
wrapper separately from Task Scheduler.

## Operator Receipt

Record only redacted evidence:

- release tag and required asset names were present;
- installer dry run used the per-user roots and pilot task name;
- installer completed on the selected host;
- `CheckOnly` returned `ok: true`;
- if run, `Scheduled` observed a fresh `complete` Hive run;
- if run, `Scheduled` observed a fresh complete normalization job;
- admin metadata responses had zero forbidden field matches;
- `/admin/` and `/admin/app.js` were reachable and contained the normalization
  UI marker;
- if checked, the workers.dev route returned `404`;
- no live token values, raw device IDs, hostnames, usernames, SIDs, profile
  paths, raw payloads, or raw inventory were captured.

## Rotate The Enrollment Token

After the pilot or rollout wave completes, rotate only the Worker enrollment
secret:

```powershell
npx wrangler secret put ENROLLMENT_TOKEN
```

Do not rotate the Cloudflare Access service token or Hive admin token as part
of this runbook unless the operator has a separate rotation window for those
credentials.

## Disable Or Uninstall

Local uninstall removes generated local state but does not disable the Hive
device:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\install-bumblebee.ps1 `
  -Uninstall `
  -InstallRoot "$env:LOCALAPPDATA\Programs\Bumblebee" `
  -ConfigRoot "$env:APPDATA\Bumblebee" `
  -TaskName "Bumblebee Baseline Pilot"
```

Remote lifecycle control is separate. Disable the Hive device through the
script admin endpoint or the Hive admin UI as documented in the Hive README.
Use a short audit reason. Re-enable is available for mistakes or returning
devices; neither action deletes local state, raw batches, runs, or HMAC
material.

For disposable smoke-test devices or stale disabled devices that should be
removed from Hive entirely, use the guarded purge workflow in the Hive README.
Always run `scripts\invoke-device-purge.ps1` without `-ConfirmPurge` first and
review the aggregate counts. Confirmed purge requires a reason and device-ID
confirmation. Production devices must be disabled before purge.
