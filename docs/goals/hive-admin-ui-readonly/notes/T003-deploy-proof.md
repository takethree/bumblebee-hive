# T003 Deploy Proof Receipt

## Result

Deployed the read-only admin UI Worker/assets package after configuring the two
new Access JWT validation secrets.

## Verification

- `npx wrangler secret list --config wrangler.deploy.toml` showed the existing
  Hive secrets and confirmed the two UI Access JWT config secrets after they
  were added.
- Access team domain and application audience were derived from the public
  Cloudflare Access redirect metadata without recording the redirect token,
  identity fields, tenant IDs, device IDs, or hostnames in this receipt.
- `npx wrangler deploy --config wrangler.deploy.toml` passed and uploaded the
  admin static assets.
- Live Access smoke with service-token headers verified:
  - `/admin/app.js`: `200`, JavaScript asset served.
  - `/v1/ui/admin/overview`: `200`, metadata JSON served.
  - `/v1/ui/admin/devices`: `200`, metadata JSON served.
  - `/v1/ui/admin/runs`: `200`, metadata JSON served.

## Gap Found

The live dashboard entrypoint `/admin/` returned a `307` asset redirect instead
of serving the HTML document. The UI API and JavaScript asset were live, but the
dashboard entrypoint was not complete. T004 was spawned to fix the static asset
entrypoint and redeploy.
