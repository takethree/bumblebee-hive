# Hive Package Drill-Down

## Objective

Implement a metadata-only package drill-down for the Hive admin UI so operators can click an inventory package and understand package impact without exposing raw inventory data.

## Original Request

Prepare a GoalBuddy board for the next Hive step: package drill-down in the admin UI.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Hive operators reviewing Bumblebee inventory metadata.
- Authority: `approved`
- Proof type: `test`
- Completion proof: API/UI tests pass, TypeScript passes, docs describe the drill-down, and a final audit confirms the feature is metadata-only and recoverable through URL state.
- Goal oracle: A tested admin UI flow where selecting a package opens a recoverable detail panel showing versions, affected devices, occurrence counts, source summaries, and latest observed metadata without forbidden raw fields.
- Likely misfire: Building another broad inventory table or raw observation browser instead of a constrained metadata drill-down.
- Blind spots considered: URL recovery, raw-field leakage, grouped version/device display, current-inventory-only semantics, and avoiding Take3-specific behavior.
- Existing plan facts:
  - Add package selection state to the admin UI URL.
  - Add a package detail panel inside the Inventory section, not a new global page.
  - Add parallel `/v1/admin/*` and `/v1/ui/admin/*` detail endpoints only if the current list endpoint is not sufficient.
  - Use `inventory_current` and grouped metadata only.
  - Do not expose raw paths, raw records, `summary_json`, R2 object keys, HMAC material, hostnames, usernames, SIDs, profile paths, or local filesystem details.
  - Update README admin UI docs.

## Goal Oracle

The oracle for this goal is:

`A package row can be selected in the Hive admin UI, the selected package detail is recoverable from the URL, tests prove the metadata-only API/UI behavior, and forbidden raw fields remain absent from responses.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the package drill-down plan against the current Hive admin routes and UI state, then implement the largest safe local slice that adds the drill-down, tests it, and updates docs. This tranche does not include production deploy, pushing, or commit creation unless the user explicitly asks after implementation.

## Non-Negotiable Constraints

- Keep Hive generic and open source; do not add Take3-specific logic, copy, domains, or credentials.
- Keep admin visibility metadata-only.
- Preserve Cloudflare Access browser routes and token-based script routes as separate surfaces.
- Do not expose raw inventory payloads, raw local paths, raw object keys, HMAC material, hostnames, usernames, SIDs, or profile paths.
- Keep UI state recoverable through URL parameters where selection affects operator recovery.
- Prefer current normalized D1 data and avoid migrations unless validation proves they are necessary.

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

`docs/goals/hive-package-drilldown/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/hive-package-drilldown/goal.md.
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
