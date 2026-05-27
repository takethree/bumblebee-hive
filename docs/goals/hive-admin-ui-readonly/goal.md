# Hive Admin UI Read-Only MVP

## Original Request

`$goalbuddy:goal-prep` after approving a plan for a live Hive admin UI.

## Interpreted Outcome

Prepare a GoalBuddy board to implement a read-only Hive operator dashboard at `/admin/` that shows live metadata from Hive without exposing raw inventory, secrets, or an admin token to browser JavaScript.

## Existing Plan Facts

- Build a read-only MVP first; no disable/revoke buttons in this tranche.
- Use vanilla static assets, not React/Vite or Worker-rendered HTML.
- Serve UI assets from the Worker using Cloudflare Workers Static Assets.
- Browser authentication uses Cloudflare Access JWT validation, not a browser-held `ADMIN_TOKEN`.
- Existing token-based `/v1/admin/*` routes remain script/operator API routes and continue to require Access plus `X-Hive-Admin-Token`.
- Add same-origin UI routes under `/v1/ui/admin/*` for overview, devices, device detail, and runs.
- Add Access JWT config via Worker env/secrets, expected as `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.
- Add a JWT validation dependency such as `jose` unless the Judge finds a simpler Cloudflare-native route that is equally safe and testable.

## Goal Oracle

The goal is complete when an authenticated operator can open `/admin/` and see live Hive overview, devices, device detail, and runs through metadata-only UI routes, while tests prove browser code never needs `X-Hive-Admin-Token` and no UI/API response exposes raw inventory, `summary_json`, R2 object keys, HMAC material, Access secrets, hostnames, usernames, SIDs, or full local profile paths.

## Constraints

- Keep the UI read-only in this tranche.
- Do not add raw inventory browsing or R2 object download links.
- Do not put `ADMIN_TOKEN`, Access client secrets, enrollment tokens, HMAC keys, or Hive encryption keys in static assets or browser storage.
- Do not weaken or replace existing `/v1/admin/*` token requirements.
- Preserve Cloudflare Access as the browser-facing auth boundary and validate the Access JWT server-side for UI API routes.
- Prefer small, maintainable Worker-compatible TypeScript and vanilla frontend code.
- Keep responses `Cache-Control: no-store` for UI admin data.
- Keep source organization-neutral; do not add TakeThree-specific URLs, tenant names, IDs, hostnames, tokens, or local paths.

## Likely Misfire

The dangerous wrong success is building a nice-looking dashboard that gets data by placing `ADMIN_TOKEN` or service-token credentials in browser JavaScript, or broadening the admin API into raw inventory access. The board should keep pressure on auth separation, metadata-only responses, and browser-visible secret hygiene.

## Starter Command

`/goal Follow docs/goals/hive-admin-ui-readonly/goal.md.`
