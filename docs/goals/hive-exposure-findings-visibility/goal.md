# Hive Exposure Findings Visibility

## Objective

Add a metadata-only Hive operator surface for Bumblebee `record_type=finding`
data that is already accepted and normalized into D1.

## Original Request

`$goalbuddy:goal-prep` after planning the next Hive feature: exposure findings
API and UI visibility.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Hive operators and maintainers investigating Bumblebee exposure
  catalog matches.
- Authority: `approved`
- Proof type: `test`
- Completion proof: API/UI tests, typecheck, build, Wrangler dry-run, docs, and
  verifier updates prove findings are visible through metadata-only routes with
  no forbidden raw fields exposed.
- Goal oracle: Hive exposes paginated findings APIs and an admin UI findings
  panel backed by `exposure_findings`; all tests and safety checks pass.
- Likely misfire: Building an alerting/attention workflow, raw evidence browser,
  or current-only package view instead of exposing the historical findings
  evidence Bumblebee already emits.
- Blind spots considered: historical versus current semantics, Attention queue
  integration, safe evidence fields, URL recovery, pagination, indexes, and
  pilot verifier alignment.
- Existing plan facts:
  - Add `GET /v1/admin/findings` and `GET /v1/ui/admin/findings`.
  - Default to all historical findings, newest first.
  - Do not feed findings into Attention in this tranche.
  - Expose safe fields only: severity/catalog/package/device/run/source
    metadata and Bumblebee evidence text.
  - Filter by severity, catalog id, ecosystem, package query, device id,
    profile, and run id.
  - Add UI, tests, README coverage, D1 indexes, and verifier coverage.

## Goal Oracle

The oracle for this goal is:

`A local Hive run shows findings through admin-token and UI-Access routes, the
admin UI has a recoverable Findings panel, forbidden-field tests pass, and the
pilot verifier checks the findings endpoint and admin asset route.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a
passing tiny slice, or a clean-looking board is not enough. The goal finishes
only when a final Judge/PM audit maps receipts and verification back to this
oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Complete one local implementation tranche for findings visibility: route
surface, UI panel, URL state, indexes, docs, verifier alignment, and tests.
Production migration/deploy/push is outside this tranche unless the user asks
after local verification.

## Non-Negotiable Constraints

- Keep Hive generic and open source; do not add Take3-specific behavior.
- Keep responses metadata-only. Do not expose raw batches, `summary_json`, R2
  object keys, HMAC material, Access credentials, hostnames, usernames, SIDs,
  `source_file`, `project_path`, or local profile paths.
- Preserve existing `/v1/admin/*` admin-token auth and `/v1/ui/admin/*`
  Cloudflare Access browser auth boundaries.
- Do not add Attention queue integration, acknowledgements, assignment, snooze,
  or notification workflow in this tranche.
- Do not change Bumblebee collector behavior.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task
can be activated.

Do not stop after a single verified Worker package when the broader owner
outcome still has safe local follow-up work. Advance the board to the next
highest-leverage safe Worker package and continue unless a phase, risk,
rejected-verification, ambiguity, or final-completion review is due.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice. For this goal, the largest useful
slice is the complete findings visibility path, not one helper at a time.

## Canonical Board

Machine truth lives at:

`docs/goals/hive-exposure-findings-visibility/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status,
active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hive-exposure-findings-visibility/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer
   version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind
   spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker
   package and continue unless blocked.
10. Finish only with a Judge/PM audit receipt that maps receipts and
    verification back to the original user outcome and records
    `full_outcome_complete: true`.
