# T006 UI Live Smoke

## Completed Evidence

The UI action allowlist was configured with the operator-approved exact email
value. The raw value is not repeated in this receipt.

- `npx wrangler secret put UI_ADMIN_ACTION_EMAILS --config wrangler.deploy.toml`
  passed after rewriting the value through stdin.
- `npx wrangler deploy --config wrangler.deploy.toml` passed.
- Deployed Worker version ID: `6a7672ea-bdf7-4ee5-8f61-5d706fe8f09b`.
- Service-token probe against the UI write route returned
  `403 ui_admin_actor_unavailable`, proving the allowlist is configured while
  service-token auth still lacks a browser actor claim.
- Operator completed UI disable and enable actions against the disposable
  smoke device.
- Admin detail verification returned `200` with `Cache-Control: no-store`.
- UI lifecycle event count before cleanup: `2`.
- UI lifecycle action sequence before cleanup: `disable,enable`.
- Final script cleanup disable returned `200`, leaving the disposable smoke
  device disabled.
- Admin detail verification after cleanup returned `200` with
  `Cache-Control: no-store`.
- Final redacted device status: `disabled`.
- Lifecycle event count after cleanup: `3`.
- UI lifecycle event count after cleanup: `2`.
- Forbidden field match count in the admin detail response: `0`.

No tokens, tenant IDs, user identities, raw device IDs, hostnames, usernames,
SIDs, full local paths, HMAC material, raw inventory, R2 object keys, or
`summary_json` were printed or recorded in this receipt.
