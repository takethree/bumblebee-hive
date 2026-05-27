# T003 Deploy Proof

## Deployment

- `npx wrangler d1 migrations apply bumblebee-hive --remote --config wrangler.deploy.toml` passed.
- Remote migration applied: `0004_device_lifecycle_events.sql`.
- `npx wrangler deploy --config wrangler.deploy.toml` passed.
- Deployed Worker version ID: `45bdac9b-ff30-4e20-ae70-915cb2c049b8`.

## Redacted Live Smoke

Cloudflare Access service-token headers and the Hive admin token were loaded
from local encrypted deployment secrets and were not printed.

- `GET /admin/` returned `200` with `text/html`.
- The served admin HTML contains the lifecycle reason control.
- `GET /admin/app.js` returned `200`.
- The served admin JavaScript contains lifecycle action code.
- `GET /v1/ui/admin/overview` returned `200` with `Cache-Control: no-store`.
- Script disable route against a synthetic non-existent device returned
  `404 device_not_found`, proving auth/route handling without mutating a real
  device.
- Script enable route against a synthetic non-existent device returned
  `404 device_not_found`, proving auth/route handling without mutating a real
  device.
- UI disable route against a synthetic non-existent device returned
  `403 ui_admin_actor_unavailable` when called with service-token Access
  headers. This is expected because UI writes require a browser Access JWT with
  an email actor claim.

## Remaining Live UI Condition

Production does not currently list `UI_ADMIN_ACTION_EMAILS` or
`UI_ADMIN_ACTION_DOMAINS` as configured Worker secrets. A live UI write smoke
requires an operator-provided allowlist value and an authenticated browser
Access session for an allowlisted actor. No production device was disabled or
enabled during this smoke.

## Additional Checks

- Browser-visible static asset sensitive-value scan over `public/` found no
  matches.
- Repo/org sensitive-value scan over changed docs/source/tests found no
  org-specific values, local usernames, known Access token fragments, or local
  profile paths.
- `git diff --check` passed with only expected CRLF working-tree warnings.
