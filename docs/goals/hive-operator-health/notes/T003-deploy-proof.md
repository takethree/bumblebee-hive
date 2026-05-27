# T003 Deploy Proof

## Deployment

- `npx wrangler deploy --config wrangler.deploy.toml` passed.
- Worker version ID: `43860340-42c7-48b9-8f9b-96d1fc87c2a7`
- Wrangler uploaded the changed admin assets:
  - `/admin/styles.css`
  - `/admin/index.html`
  - `/admin/app.js`

## Redacted Live Smoke

Cloudflare Access service-token headers were loaded from local encrypted
deployment secrets and were not printed.

- `GET /v1/ui/admin/health` returned `200`.
- Health response cache control: `no-store`.
- Health config:
  - profile: `baseline`
  - expected cadence hours: `6`
  - stale hours: `24`
  - weekend grace hours: `72`
- Health counts:
  - total: `4`
  - healthy: `1`
  - stale: `0`
  - attention: `0`
  - unknown: `3`
- `GET /admin/` returned `200` with `text/html`.
- `GET /admin/app.js` returned `200`.
- Served admin JavaScript contains `/v1/ui/admin/health`.

No device IDs, run IDs, hostnames, usernames, SIDs, local paths, tokens, or
raw run/device payloads were printed in the smoke output.

## Additional Checks

- Browser-visible static asset sensitive-value scan over `public/` found no
  matches.
- Repo/org sensitive-value scan over changed docs/source/tests found no
  org-specific values, local usernames, known Access token fragments, or local
  profile paths.
- `git status --short --branch` showed only the expected working-tree changes
  for this tranche.
