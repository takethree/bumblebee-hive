# Hive Operator Visibility

## Objective

Add a first-pass metadata-only operator visibility API to Bumblebee Hive so operators can inspect devices, recent runs, and batch/run health without exposing raw inventory data.

## Original Request

"Let's do hive operator visibility. Come up with a plan" followed by `$goalbuddy:goal-prep`.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Hive operators and maintainers running Bumblebee inventory collection.
- Authority: `approved`
- Proof type: `test`
- Completion proof: Hive exposes tested admin JSON visibility endpoints, docs describe their use and limits, verification passes, and a final audit confirms no raw inventory/browser UI/second-machine pilot scope was added.
- Goal oracle: metadata-only admin visibility is working when protected JSON endpoints return device/run/batch metadata under Access plus `X-Hive-Admin-Token`, tests prove filters/auth/data-minimization behavior, and docs tell operators how to use it safely.
- Likely misfire: building a dashboard or raw inventory browser before the JSON contracts and sensitivity boundaries are proven.
- Blind spots considered: visibility must not leak raw packages or R2 payloads; read-only admin auth should match the existing revoke endpoint; the first slice should not require schema-heavy normalization or UI work.
- Existing plan facts:
  - Build JSON API only, not HTML dashboard.
  - Expose run metadata only, not raw inventory or summary JSON.
  - Use Cloudflare Access plus existing `ADMIN_TOKEN`.
  - Add lightweight D1 indexes if needed for list queries.
  - Document operator endpoints and redacted examples.

## Goal Oracle

The oracle for this goal is:

`Hive has a metadata-only admin JSON visibility API for overview, devices, device detail, and runs, protected by Access plus ADMIN_TOKEN, with tests and docs proving safe operator use and no raw inventory exposure.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Implement the first operator-visibility slice in `F:\bumblebee-hive`: admin JSON endpoints, tests, optional index migration, and README documentation. Do not build a dashboard, raw inventory browser, second-machine pilot, or Bumblebee scanner changes in this tranche.

## Non-Negotiable Constraints

- Keep the API metadata-only: no raw NDJSON, package inventory rows, `summary_json`, R2 object keys/download links, HMAC material, service secrets, hostnames, usernames, SIDs, or full profile paths.
- Protect all visibility routes with Cloudflare Access plus `X-Hive-Admin-Token`.
- Keep Hive source organization-neutral; do not add TakeThree-specific defaults or values.
- Avoid changing Bumblebee scanner behavior.
- Avoid schema changes beyond lightweight indexes unless a Judge task explicitly approves a plan correction.
- Do not perform the second-machine pilot.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after one verified Worker package if the broader operator-visibility outcome still has safe local follow-up work.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

Prefer one coherent API/test/docs slice if the current code shape supports it. Split only if verification, D1 query design, or data-minimization review exposes risk.

## Canonical Board

Machine truth lives at:

`docs/goals/hive-operator-visibility/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hive-operator-visibility/goal.md.
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
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

