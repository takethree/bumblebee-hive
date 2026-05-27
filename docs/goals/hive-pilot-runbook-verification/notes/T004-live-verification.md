# T004 Live Verification

Date: 2026-05-27

Verifier:

- `scripts/verify-bumblebee-pilot.ps1`
- Modes run: `CheckOnly`, `Scheduled`
- Secrets source: local DPAPI-protected deployment secrets
- Local pilot source: existing per-user Bumblebee install and scheduled task

CheckOnly result:

```json
{
  "ok": true,
  "mode": "CheckOnly",
  "local_config_present": true,
  "local_wrapper_present": true,
  "configured_binary_present": true,
  "configured_device_id_present": true,
  "configured_ingest_path": "/v1/ingest",
  "configured_scan_profile": "baseline",
  "selftest_exit_code": 0,
  "admin_secrets_present": true,
  "scheduled_task_present": true,
  "scheduled_task_last_result": 0,
  "admin_endpoint_statuses": [200, 200, 200],
  "admin_endpoint_cache_control": ["no-store", "no-store", "no-store"],
  "admin_endpoint_forbidden_match_count": 0,
  "latest_run_exists": true,
  "latest_run_status": "complete",
  "latest_run_forbidden_match_count": 0
}
```

Scheduled result:

```json
{
  "ok": true,
  "mode": "Scheduled",
  "scheduled_task_present": true,
  "scheduled_task_completed": true,
  "scheduled_task_last_result": 0,
  "fresh_run_observed": true,
  "fresh_run_status": "complete",
  "fresh_run_received_at_present": true,
  "fresh_run_forbidden_match_count": 0,
  "admin_endpoint_statuses": [200, 200, 200],
  "admin_endpoint_cache_control": ["no-store", "no-store", "no-store"],
  "admin_endpoint_forbidden_match_count": 0
}
```

Forbidden strings checked:

- `summary_json`
- `object_key`
- `hmac_key_ciphertext`
- `hmac_key_nonce`
- `body_sha256`
- `raw`

Redaction boundary:

- Secret values were not printed.
- Raw inventory and raw HTTP payloads were not printed.
- Raw device IDs, usernames, SIDs, hostnames, full profile paths, R2 object
  keys, and `summary_json` were not printed.
