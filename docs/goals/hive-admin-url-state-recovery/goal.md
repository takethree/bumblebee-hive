# Hive Admin URL State Recovery

## Intake

- Original request: `$goalbuddy:goal-prep` after approving the admin URL state recovery plan.
- Interpreted outcome: Prepare a GoalBuddy board to make Hive admin UI navigation recoverable through URLs, with path routes for selected devices and query params for filters.
- Input shape: existing_plan.
- Audience: Hive operators and maintainers.
- Authority: approved for board preparation; implementation starts only after `/goal`.
- Proof type: test, browser/API smoke, and final audit.
- Completion proof: `/admin/devices/<device-id>` opens the admin shell and restores the selected device; query params restore the chosen filters; clicking devices, clearing devices, changing filters, and Back/Forward keep URL and UI state in sync; tests and live smoke prove the behavior without exposing forbidden raw fields.

## Goal Oracle

The tranche is complete when an operator can click into a device, refresh or share the resulting URL, and recover the same device context and filters from the URL while existing admin assets and API routes still work.

## Existing Plan Facts

- Use `/admin/` for the main dashboard.
- Use `/admin/devices/<device-id>` for selected device recovery.
- Use query params for recoverable filters: `device_status`, `inventory_view`, `package_query`, `ecosystem`, `profile`, `run_status`, and `run_profile`.
- Support `history.pushState` for selecting/clearing devices.
- Support `history.replaceState` for filter/grouping changes to avoid noisy browser history.
- Support `popstate` for Back/Forward recovery.
- Keep `localStorage` as fallback/default for inventory grouping, but URL query value wins when present.
- Do not put auto-refresh state in the URL.

## Constraints

- Do not expose raw payload JSON, `summary_json`, R2 object keys, HMAC material, Access secrets, enrollment tokens, hostnames, usernames, SIDs, `source_file`, `project_path`, or full source/profile paths.
- Device IDs are acceptable in admin URLs because the admin UI already displays them and is behind Cloudflare Access.
- Do not break `/admin/`, `/admin/app.js`, `/admin/styles.css`, `/v1/admin/*`, or `/v1/ui/admin/*` routes.
- Do not delete data, change Bumblebee scanner output semantics, or add a schema migration.
- Do not revert or overwrite existing uncommitted Hive normalized-inventory, summary-view, or grouping-preference work.

## Likely Misfire

The dangerous wrong success is updating the browser URL when users click but failing to hydrate from direct navigation or Back/Forward, or routing `/admin/devices/<id>` through the asset binding as a missing static file. The correct fix includes Worker shell fallback plus client-side URL parse/sync/recovery tests.

## Done For This Tranche

Complete URL state recovery for the admin UI: Worker shell route support for device paths, client-side path/query hydration, URL updates on device and filter interactions, Back/Forward handling, docs/tests/dry-runs, deploy validation, and redacted live smoke evidence if credentials are available.
