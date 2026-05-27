Result: done.

Implemented:
- Added `GET /v1/admin/attention` and `GET /v1/ui/admin/attention`.
- Added server-computed attention rows from active-device health plus latest normalization job state.
- Added `NORMALIZATION_PROCESSING_STALE_MINUTES` with default `30`.
- Added metadata-only severity/reason mapping for:
  - `latest_run_not_complete`
  - `latest_complete_run_too_old`
  - `no_monitored_profile_run`
  - `normalization_missing`
  - `normalization_error`
  - `normalization_processing_stale`
  - `normalization_not_promoted`
- Added additive migration `0007_attention_queue_indexes.sql`.
- Added top admin Attention panel with severity/reason filters, per-list pagination, row count, and device navigation.
- Added recoverable URL state for `attention_severity`, `attention_reason`, `attention_page`, and `attention_page_size`.
- Updated README with operator behavior, endpoint, config, examples, and verifier expectations.
- Added tests for admin attention, UI attention, metadata minimization, disabled-device exclusion, pagination, and attention URL state.

Verification:
- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 3 files and 49 tests.
- `git diff --check`: passed.

Notes:
- No deploy, remote migration, push, or commit was performed.
- Attention remains read-only and does not add retry, replay, queue mutation, raw batch browsing, lifecycle action, or inventory anomaly scoring behavior.
