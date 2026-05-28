# Contributing to Bumblebee Hive

Thanks for your interest. This project favors small, focused changes with tests.

## Local Development

Requires Node.js 22+.

```powershell
npm install
npm test
npm run build
```

For cross-repo end-to-end tests, keep a local Bumblebee checkout available and
run:

```powershell
$env:BUMBLEBEE_E2E = "1"
$env:BUMBLEBEE_REPO = "F:\bumblebee"
npm run test:e2e
```

## Pull Requests

- Keep PRs small and focused. Separate refactors from behavior changes.
- Match the existing conventional-commits style where practical:
  `fix(scope): ...`, `feat(scope): ...`, `docs: ...`, `test: ...`.
- Add or update tests for behavior changes.
- Update `README.md` when adding or changing operator-facing routes, scripts,
  configuration, environment variables, deployment behavior, or security
  posture.
- Do not commit `.local/`, `.wrangler/`, `dist/`, `node_modules/`, generated
  local planning boards, service tokens, HMAC keys, enrollment tokens, admin tokens,
  local hostnames, usernames, SIDs, raw object keys, or raw inventory payloads.

## Database Migrations

D1 schema changes land under `migrations/` as numbered SQL files. Keep
migrations additive when possible and document operator impact in `README.md` or
the rollout runbook.

## Security Issues

Do not file public issues for vulnerabilities. See `SECURITY.md`.
