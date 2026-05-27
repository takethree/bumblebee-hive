# T001 Judge Receipt

## Decision

Proceed with one coherent Worker package for operator health.

## Current-State Facts

- Existing UI routes under `/v1/ui/admin/*` already validate Cloudflare Access
  JWTs server-side and do not require `X-Hive-Admin-Token` in browser code.
- Existing token-protected script/operator routes under `/v1/admin/*` remain
  separate and should not be weakened.
- The D1 schema already stores active/disabled devices and run metadata needed
  for baseline health: `devices.disabled_at`, `runs.profile`, `runs.status`,
  and `runs.received_at`.
- The admin UI is vanilla HTML/CSS/JS and already renders overview, devices,
  device detail, and runs from metadata-only API responses.
- Tests already have an in-memory D1/R2 harness, Access JWT helpers, UI route
  auth tests, and forbidden-field checks.

## Approved Worker Package

Implement generic baseline health in one slice:

- Add `HEALTH_PROFILE`, `HEALTH_EXPECTED_CADENCE_HOURS`,
  `HEALTH_STALE_HOURS`, and `HEALTH_WEEKEND_GRACE_HOURS` env config with
  defaults from the goal.
- Add `GET /v1/ui/admin/health`, protected by the existing UI Access JWT path.
- Compute health for active devices only using the latest configured-profile
  run and latest completed configured-profile run.
- Classify rows as `healthy`, `stale`, `attention`, or `unknown`.
- Apply weekend grace generically through env config rather than hardcoding
  operator-specific assumptions.
- Add admin UI health cards/table and docs.
- Add focused tests for classification, auth separation, and data minimization.

## Allowed Files

- `src/index.ts`
- `public/admin/**`
- `test/**`
- `README.md`
- `wrangler.toml`
- `wrangler.deploy.toml`
- `migrations/**` only if validation shows a needed index
- `docs/goals/hive-operator-health/state.yaml`
- `docs/goals/hive-operator-health/notes/**`

## Verification

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Wrangler deploy dry-run or equivalent validation
- Static sensitive-value scan over browser-visible assets, source, tests,
  README, and GoalBuddy receipts
- HTTP or browser smoke for `/admin/` and `/v1/ui/admin/health` when feasible
- `git diff --check`

## Stop Conditions

- Need to expose `ADMIN_TOKEN`, service-token secrets, enrollment tokens, HMAC
  keys, Hive encryption keys, raw inventory, `summary_json`, R2 object keys,
  hostnames, usernames, SIDs, or full local profile paths.
- Need to add write actions such as disabling or revoking devices.
- Need to weaken `/v1/admin/*` token requirements.
- Need files outside the approved Worker scope.
