Decision: approve.

Endpoint approach:
- Add `GET /v1/admin/attention` behind existing script admin auth.
- Add `GET /v1/ui/admin/attention` behind existing browser Access JWT auth.
- Reuse health config and active-device health computation as the run state source.
- Add a normalization freshness config value `NORMALIZATION_PROCESSING_STALE_MINUTES`, default `30`.
- Return `config`, `counts`, `attention`, pagination metadata, and `filters`.

Attention reason and severity mapping:
- `latest_run_not_complete`: critical.
- `latest_complete_run_too_old`: warning.
- `no_monitored_profile_run`: warning.
- `normalization_missing`: warning.
- `normalization_error`: critical.
- `normalization_processing_stale`: critical.
- `normalization_not_promoted`: warning.

Normalization rule:
- Only evaluate normalization state for the latest complete monitored-profile run.
- If no latest complete monitored-profile run exists, use the health reason only.
- If no normalization job exists for that device/run, report `normalization_missing`.
- If latest job is `error`, report `normalization_error`.
- If latest job is `processing` and older than the configured stale threshold, report `normalization_processing_stale`.
- If latest job is `complete` but `promoted_current` is false, report `normalization_not_promoted`.
- Recent in-progress processing is not attention.

Migration:
- Add `migrations/0007_attention_queue_indexes.sql`.
- Add `idx_normalization_jobs_device_run_started ON normalization_jobs(device_id, run_id, started_at DESC)`.

UI approach:
- Insert an Attention panel above Health.
- Add severity, reason, and row-count controls on that panel.
- Add per-panel pagination.
- Preserve `attention_severity`, `attention_reason`, `attention_page`, and `attention_page_size` in URL state.
- Rows should navigate to device detail when clicked.

Allowed Worker files:
- `src/index.ts`
- `migrations/0007_attention_queue_indexes.sql`
- `public/admin/index.html`
- `public/admin/app.js`
- `public/admin/styles.css`
- `test/ingest.test.ts`
- `test/admin-url-state.test.ts`
- `README.md`

Verify:
- `npm.cmd test`
- `npm.cmd run typecheck`
- `git diff --check`

Stop if:
- A raw-data field, R2 object key, local path, hostname, username, SID, HMAC material, or Access credential would be exposed.
- The implementation needs mutation, retry, replay, queue controls, or package anomaly scoring.
- Files outside the approved Worker scope are needed.
