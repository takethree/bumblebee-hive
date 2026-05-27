# T004 Worker Receipt

## Changed Files

- `src/index.ts`
- `test/ingest.test.ts`
- `docs/goals/hive-admin-ui-readonly/state.yaml`
- `docs/goals/hive-admin-ui-readonly/notes/T003-deploy-proof.md`
- `docs/goals/hive-admin-ui-readonly/notes/T004-entrypoint-fix.md`

## Fix

Stopped rewriting `/admin/` to `/admin/index.html` before calling the
Cloudflare assets binding. The live binding treats `/admin/` as the canonical
directory route and was redirecting `/admin/index.html` back to `/admin/`.

## Verification

- `npm test` passed: 2 files, 23 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npx wrangler deploy --config wrangler.deploy.toml` passed.
- Live Access smoke with service-token headers verified:
  - `/admin/`: `200`, HTML document served, no redirect.
  - `/admin/app.js`: `200`, JavaScript asset served.
  - `/v1/ui/admin/overview`: `200`, metadata JSON served.
  - `/v1/ui/admin/devices`: `200`, metadata JSON served.
  - `/v1/ui/admin/runs`: `200`, metadata JSON served.
- Browser-visible static asset sensitive-value scan over `public/` found no
  matches.
- Repo/org sensitive-value scan over changed docs/source/tests found no
  matches.
- `git diff --check` passed with only expected CRLF working-tree warnings.

## Known Test Gap

Chrome automation was attempted for a visual browser render, but the local
Chrome extension bridge was unavailable in this session. The deployed HTTP
entrypoint and UI data routes were still smoke-tested through Cloudflare Access
without printing tokens, tenant IDs, user identities, device IDs, hostnames,
usernames, SIDs, or full local paths.
