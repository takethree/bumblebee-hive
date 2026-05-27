# Hive Checkpoint and Pagination

## Original Request

Prepare a GoalBuddy board for the approved plan: commit and push the current deployed Hive work as split goal-shaped commits, then add numbered pagination to the Hive admin UI.

## Interpreted Outcome

Hive's deployed but uncommitted work is safely checkpointed and pushed, then the admin UI supports exact numbered pagination for devices, runs, inventory, and selected-device package inventory without weakening auth, exposing sensitive data, or breaking existing admin/script clients.

## Input Shape

existing_plan

## Audience

Hive maintainers and operators.

## Goal Oracle

The tranche is complete when:

- the current deployed dirty work is committed in defensible goal-shaped commits and pushed to `origin/main`;
- the admin API returns additive exact pagination metadata for devices, runs, packages, and device-scoped packages;
- the admin UI exposes numbered pagination for those views and preserves pagination in recoverable URLs;
- tests, typecheck/lint, Worker dry-runs, and redacted live smoke pass without exposing raw inventory, identities, local paths, object keys, or secrets.

## Non-Goals and Constraints

- Do not implement raw inventory browsing or R2 object download links.
- Do not weaken Cloudflare Access, UI admin authorization, or existing `/v1/admin/*` token requirements.
- Do not commit secrets, deployment-only credentials, local machine identifiers, raw payloads, raw device IDs, hostnames, usernames, SIDs, full local paths, R2 object keys, HMAC material, `summary_json`, or live package names from smoke output.
- Do not rewrite the admin UI architecture or add a frontend framework.
- Do not add destructive migrations or delete production data.
- Keep pagination metadata additive so existing clients continue to work.

## Existing Plan Facts

- Checkpoint the current deployed Hive changes before pagination work starts.
- Split the checkpoint into goal-shaped commits rather than one large commit.
- Add exact numbered pagination, not load-more or infinite scroll.
- Preserve existing `limit` and `offset` behavior.
- Add `total`, `page`, `page_count`, and `has_more` metadata.
- Add numbered pagination controls for devices, runs, inventory, and selected-device packages.
- Add URL state for `device_page`, `run_page`, `inventory_page`, and `detail_inventory_page`.
- Use `pushState` for page navigation and `replaceState` for filter changes.

## Likely Misfire

The goal can appear successful if it only adds UI controls over the first page, commits unrelated or secret-bearing files, or adds exact totals for one endpoint while leaving other admin views with hidden data.

## Starter Command

`/goal Follow docs/goals/hive-checkpoint-pagination/goal.md.`
