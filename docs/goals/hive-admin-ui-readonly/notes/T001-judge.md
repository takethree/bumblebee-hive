# T001 Judge Receipt

## Decision

Proceed with one coherent Worker package for the read-only admin UI MVP.

## Current-State Facts

- Hive is a single TypeScript Worker with existing metadata-only `/v1/admin/*` routes.
- Existing `/v1/admin/*` routes require Cloudflare Access plus `X-Hive-Admin-Token`; those routes must remain unchanged for scripts/operators.
- The repo currently has no frontend framework or static asset directory.
- Current tests already cover metadata-only admin overview, devices, device detail, runs, and forbidden field minimization.
- Current Wrangler configs do not define static assets.
- Cloudflare Workers Static Assets supports `[assets] directory = "./public"` and optional `binding = "ASSETS"`.
- Cloudflare Access documentation recommends validating `Cf-Access-Jwt-Assertion` in Workers instead of relying on the Access cookie.

## Approved Worker Package

Implement the read-only admin UI MVP:

- Add vanilla static assets under `public/admin/`.
- Add `[assets]` config with `directory = "./public"` and `binding = "ASSETS"` to both Wrangler configs.
- Add an `ASSETS` binding to `Env`.
- Add `/admin` redirect and serve `/admin/` and `/admin/*` through `env.ASSETS.fetch` when present.
- Add `/v1/ui/admin/*` routes for overview, devices, device detail, and runs.
- Validate Cloudflare Access JWTs for `/v1/ui/admin/*` using `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `Cf-Access-Jwt-Assertion`, and `jose`.
- Keep existing `/v1/admin/*` auth unchanged.
- Reuse the existing metadata query/formatting logic so UI and script APIs return the same minimized shapes.
- Document operator setup and add tests for JWT auth, static UI, no-store metadata responses, and forbidden field minimization.

## Verification

- `npm install jose` from npm, then commit `package.json` and `package-lock.json`.
- `npm test`
- `npm run typecheck`
- `npm run lint`
- Wrangler deploy dry-run or equivalent non-mutating deploy validation.
- HTTP/unit smoke for `/admin/` and `/v1/ui/admin/*`.
- Static sensitive-value scans across `public/admin`, `src`, `test`, docs, and GoalBuddy receipts.
- `git diff --check`.

## Stop Conditions

- Need to expose `ADMIN_TOKEN`, Access client secrets, enrollment tokens, HMAC keys, Hive encryption keys, raw inventory, `summary_json`, R2 object keys, hostnames, usernames, SIDs, or full local profile paths.
- Need to add write actions such as disabling or revoking devices.
- Need to change production Cloudflare Access policy or rotate secrets.
- Need to weaken existing `/v1/admin/*` token requirements.
