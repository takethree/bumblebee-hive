# Hive Inventory Grouping Preference

## Intake

- Original request: `$goalbuddy:goal-prep` after approving the package-family inventory grouping plan.
- Interpreted outcome: Prepare a GoalBuddy board to add a configurable Hive admin inventory grouping preference where the UI defaults to package-family grouping while preserving package+version and observation-level troubleshooting modes.
- Input shape: existing_plan.
- Audience: Hive operators and maintainers.
- Authority: approved for board preparation; implementation starts only after `/goal`.
- Proof type: test, UI/API smoke, and final audit.
- Completion proof: Hive admin inventory defaults to a package-family view, operators can switch grouping modes, the choice persists per browser, package APIs expose a package-family mode, existing summary and observation modes remain available, and tests/live smoke prove the behavior without exposing forbidden raw fields.

## Goal Oracle

The tranche is complete when the Inventory screen opens to one row per package family by default, shows version spread and total occurrences clearly, lets the operator switch to package+version or observations, remembers the choice in the browser, and all three API modes remain queryable and safe.

## Existing Plan Facts

- Current `view=summary` groups by device ID, profile, ecosystem, normalized package name, and version.
- Current `view=observations` returns row-level current observations for troubleshooting.
- Same package across multiple versions should not be hidden; operators need a cleaner family row that preserves visible version detail.
- Add API mode `view=package` for package-family grouping rather than replacing `view=summary`.
- UI default should be package-family view.
- UI preference should be per operator/browser using `localStorage`, not a server-side default in this slice.
- Preserve the existing auth split: admin-token routes and browser Access JWT routes.

## Constraints

- Do not expose `source_file`, `project_path`, raw payload JSON, hostnames, usernames, SIDs, R2 object keys, HMAC material, Access secrets, enrollment tokens, or `summary_json`.
- Do not delete current observation data.
- Do not change Bumblebee scanner output semantics.
- Do not add a schema migration unless Judge finds the current data cannot safely support package-family grouping.
- Do not break the existing `view=summary` or `view=observations` API modes.
- Do not revert or overwrite existing uncommitted normalized-inventory or summary-view work.

## Likely Misfire

The dangerous wrong success is hiding version spread by collapsing a package into one row without version detail, or replacing `view=summary` so API callers lose the package+version grouping they already have. The correct fix adds a package-family mode and a UI preference while preserving explicit lower-level modes.

## Done For This Tranche

Complete the configurable grouping operator experience: package-family API mode, browser-persisted UI grouping control, clear version detail rendering, tests, docs, dry-run/deploy validation, and redacted live smoke evidence if credentials and pilot data are available.
