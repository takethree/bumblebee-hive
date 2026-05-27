# Hive Normalization Visibility

## Objective

Add metadata-only visibility into Hive's normalization pipeline so operators can tell whether missing or stale inventory is caused by ingest, queue processing, normalization errors, or non-promoted runs.

## Original Request

Prepare a GoalBuddy board for the next Hive plan: normalization/job visibility.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Hive operators diagnosing Bumblebee inventory freshness and missing-data issues.
- Authority: `approved`
- Proof type: `test`
- Completion proof: API/UI tests pass, TypeScript passes, docs describe the normalization visibility surface, and a final audit confirms no raw inventory or secret-bearing data is exposed.
- Goal oracle: Operators can view recent normalization jobs globally and on a selected device, filter/paginate the job list, and distinguish processing, complete/promoted, complete/not-promoted, and error states without raw batch access.
- Likely misfire: Building queue mutation, retry, replay, or raw batch inspection instead of read-only operator visibility.
- Blind spots considered: D1 query performance, safe error display, device-detail context, URL recoverability, data minimization, and keeping deployment/migration application separate from local implementation unless explicitly requested.
- Existing plan facts:
  - Add `GET /v1/admin/normalization-jobs?status=&device_id=&run_id=&promoted_current=&limit=&offset=`.
  - Add `GET /v1/ui/admin/normalization-jobs?...`.
  - Return safe metadata only: `batch_id`, `device_id`, `run_id`, `status`, record/package/finding counts, `promoted_current`, sanitized `error`, `started_at`, `completed_at`, and pagination metadata.
  - Add recent normalization jobs to device detail responses.
  - Add a small D1 index migration for recent/status/device job lookup.
  - Add an admin UI Normalization panel with filters, default 10-row pagination, and status badges.
  - Add a compact normalization jobs table inside selected-device detail.
  - Do not add retry, replay, delete, queue mutation, raw batch access, or R2 object-key display.

## Goal Oracle

The oracle for this goal is:

`Hive exposes metadata-only normalization job visibility in API and UI, with filters, pagination, selected-device context, tests for success/error/promoted states, docs, and no forbidden raw fields.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the normalization visibility plan against current Hive routes, schema, UI state, tests, migration conventions, and metadata-only rules. Then implement the largest safe local slice: migration, read APIs, UI visibility, docs, and tests. This tranche does not include applying remote migrations, deploying, pushing, or committing unless the user explicitly asks after implementation.

## Non-Negotiable Constraints

- Keep Hive generic and open source; do not add Take3-specific logic, copy, domains, or credentials.
- Keep this read-only visibility; no retry, replay, delete, queue mutation, or raw batch access.
- Preserve Cloudflare Access browser routes and token-based script routes as separate surfaces.
- Do not expose raw inventory payloads, raw local paths, R2 object keys, HMAC material, Access credentials, hostnames, usernames, SIDs, or profile paths.
- Keep UI state recoverable through URL parameters where selection/filtering affects operator recovery.
- Any D1 migration must be additive and safe for the existing live Hive database.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/hive-normalization-visibility/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hive-normalization-visibility/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
