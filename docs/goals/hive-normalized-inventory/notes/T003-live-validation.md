# T003 Live Validation

## Deployment

- Remote D1 migration applied: `0005_normalized_inventory.sql`.
- Worker deployed after adding the queue consumer subscription.
- Deployed Worker version: `b29311b4-3544-4aed-8d37-2f8e8ef67e9c`.
- Deployment output confirmed both producer and consumer triggers for the normalization queue.

## Live Smoke

The smoke used local encrypted deployment credentials and did not print token
values, raw device identifiers, hostnames, usernames, SIDs, raw payloads, R2
object keys, source paths, project paths, or package names.

- Existing pilot scheduled verification passed.
- Fresh scheduled pilot run observed as `complete`.
- `/admin/` returned `200`.
- `/admin/app.js` returned `200` and contains the inventory route.
- `/v1/admin/packages` returned `200` with `Cache-Control: no-store`.
- Pilot baseline package count was greater than zero.
- Package search returned at least one row.
- `/v1/ui/admin/packages` returned `200`.
- Forbidden field match count was `0` for admin package and UI package responses.

## Verification

- `npm test` passed with 35 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx wrangler deploy --config wrangler.toml --dry-run` passed.
- `npx wrangler deploy --config wrangler.deploy.toml --dry-run` passed.
- `git diff --check` passed.
