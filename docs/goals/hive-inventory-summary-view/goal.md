# Hive Inventory Summary View

## Intake

- Original request: `$goalbuddy:goal-prep` after approving the deduped inventory view plan.
- Interpreted outcome: Prepare a GoalBuddy board to make Hive's inventory UI and package APIs default to a deduped package summary view while preserving observation-level access for troubleshooting.
- Input shape: existing_plan.
- Audience: Hive operators and maintainers.
- Authority: approved for board preparation; implementation starts only after `/goal`.
- Proof type: test, UI/API smoke, and final audit.
- Completion proof: Package APIs and the admin UI default to rolled-up package summaries with occurrence counts and source-category summaries; observation-level rows remain available through an explicit mode; tests and live smoke prove the behavior without exposing forbidden raw fields.

## Goal Oracle

The tranche is complete when the inventory screen no longer shows repeated rows for the same visible package/version by default, and Hive can still return row-level current observations through an explicit `view=observations` API mode for troubleshooting.

## Existing Plan Facts

- Current inventory rows are package observations, so duplicate-looking rows are expected when the same package/version appears in multiple hidden sources.
- The desired default operator experience is a rolled-up view, not raw observation rows.
- Default grouping should be one row per `device_id + profile + ecosystem + normalized_name + version`.
- Summary rows should include occurrence count and unique source-category fields, not raw source paths.
- Observation-level access should remain available through an explicit `view=observations` mode.
- The prior normalized-inventory tranche is currently present as uncommitted repo changes and should be preserved, not reverted.

## Constraints

- Do not expose `source_file`, `project_path`, raw payload JSON, hostnames, usernames, SIDs, R2 object keys, HMAC material, Access secrets, enrollment tokens, or `summary_json`.
- Preserve the existing auth split: `/v1/admin/*` requires Access plus `X-Hive-Admin-Token`; `/v1/ui/admin/*` uses browser Access JWT only.
- Do not change Bumblebee scanner output semantics.
- Do not redesign the normalization schema unless Judge finds the summary view cannot be implemented safely from current data.
- Avoid destructive migrations or data deletion.
- Do not revert or overwrite the existing uncommitted normalized-inventory work.

## Likely Misfire

The dangerous wrong success is hiding duplicates by dropping observation data or by grouping so aggressively that different versions, profiles, ecosystems, or devices become indistinguishable. The correct fix is a summary default with enough counts/source categories to explain why observations exist, plus an explicit observation view for troubleshooting.

## Done For This Tranche

Complete the deduped inventory operator experience: API summary mode, explicit observations mode, UI updates, tests, docs, dry-run/deploy validation, and redacted live smoke evidence if credentials and pilot data are available.
