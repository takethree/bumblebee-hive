# T001 Judge Receipt

## Decision

Proceed with one coherent Worker package for audited device lifecycle controls.

## Current-State Facts

- Hive already has a script/operator disable endpoint:
  `POST /v1/admin/devices/:device_id/disable`.
- Script/operator routes require Cloudflare Access plus `X-Hive-Admin-Token`
  through `requireAdminRequest` or equivalent direct checks.
- Browser UI data routes live under `/v1/ui/admin/*` and validate
  `Cf-Access-Jwt-Assertion` server-side; browser code does not use
  `ADMIN_TOKEN`.
- The current schema has `devices.disabled_at`, but no lifecycle event table.
- The admin UI is vanilla HTML/CSS/JS and already has a selected-device detail
  panel where lifecycle controls can live without adding a new screen.
- Existing tests use an in-memory D1/R2/Assets harness and already cover admin
  token separation, Access JWT UI routes, device disable, and metadata-only
  responses.
- A migration is appropriate because durable audit events are part of the
  approved owner outcome.

## Approved Worker Package

Implement the lifecycle tranche in one vertical slice:

- Add a D1 migration for `device_lifecycle_events`.
- Add shared device lifecycle logic for `disable` and `enable`.
- Keep script endpoints under `/v1/admin/*` protected by Access plus
  `X-Hive-Admin-Token`.
- Add UI endpoints under `/v1/ui/admin/*` protected by verified Access JWT plus
  env allowlist.
- Require UI reason text and confirmation in the browser.
- Return only metadata-safe lifecycle/device responses.
- Show recent lifecycle events in device detail.
- Update README/runbook docs.
- Add tests for script path, UI path, allowlist failures, no-op conflicts,
  audit events, and forbidden fields.

## Allowed Files

- `src/index.ts`
- `public/admin/**`
- `test/**`
- `README.md`
- `docs/developer-rollout-runbook.md`
- `migrations/**`
- `docs/goals/hive-device-lifecycle-controls/state.yaml`
- `docs/goals/hive-device-lifecycle-controls/notes/**`

## Verification

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node --check public/admin/app.js`
- Wrangler dry-run with `wrangler.toml`
- Wrangler dry-run with `wrangler.deploy.toml` when available
- Browser-visible static sensitive-value scan over `public/`
- Repo/org sensitive-value scan over touched source/docs/tests/receipts
- `git diff --check`

## Stop If

- Need to put admin/service credentials, enrollment tokens, HMAC material, or
  encryption keys into browser-visible code.
- Need delete, revoke, purge, HMAC rotation, or local uninstall semantics.
- Need to weaken `/v1/admin/*` admin-token authorization.
- Need production-only Cloudflare Access policy changes before local tests can
  prove the implementation.
