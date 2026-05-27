Decision: complete.

Full outcome complete: true.

Requirement audit:
- `GET /v1/admin/attention`: implemented in `src/index.ts` behind existing script admin auth.
- `GET /v1/ui/admin/attention`: implemented in `src/index.ts` behind existing Access JWT UI auth.
- Paginated metadata-only rows: response returns `attention` plus `limit`, `offset`, `total`, `page`, `page_count`, and `has_more`; tests check forbidden visibility fields.
- Severity/reason filters: implemented and tested for `severity` and `reason`.
- Top admin panel: `public/admin/index.html` adds Attention above Health; `public/admin/app.js` loads and renders it.
- URL recovery: `attention_severity`, `attention_reason`, `attention_page`, and `attention_page_size` are persisted and tested.
- Run, health, and normalization states: tests cover incomplete runs, stale complete runs, missing normalization, error normalization, stale processing normalization, not-promoted normalization, disabled-device exclusion, and successful normalization not appearing.
- README: documents operator attention behavior, endpoint, config, reasons, examples, and verifier expectations.
- Migration: `migrations/0007_attention_queue_indexes.sql` adds `normalization_jobs(device_id, run_id, started_at DESC)`.
- Non-goals: no retry, replay, queue mutation, raw batch browsing, lifecycle action, or package anomaly scoring was added.

Verification evidence:
- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 3 files and 49 tests.
- `git diff --check`: passed.
- GoalBuddy state checker: passed.

Missing evidence: none for this local implementation tranche.

Operational note:
- Remote deploy, remote D1 migration, commit, and push were explicitly outside this tranche unless separately requested.
