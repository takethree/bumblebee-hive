# Hive Operator Attention Queue

## Original Request

Prepare a GoalBuddy board for the next Hive operator usability step: add a top
attention queue that correlates health, runs, and normalization status.

## Interpreted Outcome

Hive operators can open the admin dashboard and immediately see active devices
that need action, without manually correlating the Health, Devices, Runs, and
Normalization panels.

## Input Shape

Existing plan.

## Goal Oracle

Hive exposes a metadata-only, read-only operator attention queue in API and UI.
The queue is server-computed, pipeline-only, shown as a top admin panel, backed
by tests and docs, and preserves the existing script/admin-token and browser
Access-JWT route split.

## Completion Proof

The tranche is complete when:

- `GET /v1/admin/attention` and `GET /v1/ui/admin/attention` return paginated
  metadata-only attention rows with severity/reason filters.
- The admin UI shows a top Attention panel above Health.
- URL state preserves attention filters and pagination.
- Tests cover run, health, and normalization attention states.
- README documents the endpoint and operator behavior.
- `npm.cmd test`, `npm.cmd run typecheck`, and `git diff --check` pass.

## Existing Plan Facts

- Compute attention server-side.
- Keep scope pipeline-only.
- Place the panel at the top of the admin dashboard.
- Add `severity=all|critical|warning`, `reason`, `limit`, and `offset` filters.
- Include `config`, `counts`, `attention`, and pagination metadata.
- Reasons:
  - `latest_run_not_complete`
  - `latest_complete_run_too_old`
  - `no_monitored_profile_run`
  - `normalization_missing`
  - `normalization_error`
  - `normalization_processing_stale`
  - `normalization_not_promoted`
- Add `NORMALIZATION_PROCESSING_STALE_MINUTES`, default `30`.
- Add an additive D1 index on `normalization_jobs(device_id, run_id, started_at DESC)`.

## Non-Goals

- Do not add retry, replay, queue mutation, raw batch browsing, or lifecycle
  actions.
- Do not include package/inventory anomaly scoring in this tranche.
- Do not expose raw inventory, `summary_json`, R2 object keys, HMAC material,
  Access credentials, hostnames, usernames, SIDs, source paths, project paths,
  or local profile paths.
- Do not deploy, migrate remote D1, push, or commit unless the user explicitly
  asks after implementation.

## Constraints

- Preserve existing `/v1/admin/*` token-protected script/operator routes.
- Preserve existing `/v1/ui/admin/*` browser Access-JWT routes.
- Disabled devices are excluded from attention.
- Attention must be metadata-only and read-only.
- Prefer the existing admin UI patterns: plain HTML/CSS/JS, compact tables,
  per-list pagination, and recoverable URL state.

## Starter Command

```text
/goal Follow docs/goals/hive-operator-attention-queue/goal.md.
```
