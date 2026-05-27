# T004 Live Smoke

Date: 2026-05-26

Deployment:

- Applied remote D1 migration `0002_admin_visibility_indexes.sql`.
- Deployed Worker with Wrangler.
- Deployed Worker version: `a1a8c06c-c04f-4705-8477-8fdc5a955526`.

Smoke target:

- `https://hive.take3tech.dev`

Auth:

- Cloudflare Access service-token headers loaded from local DPAPI-protected deployment secrets.
- `X-Hive-Admin-Token` loaded from local DPAPI-protected deployment secrets.
- Secret values were not printed.

Redacted results:

```json
[
  {
    "path": "/v1/admin/overview",
    "status": 200,
    "cache_control": "no-store",
    "forbidden_matches": [],
    "top_level_keys": "devices,runs,batches"
  },
  {
    "path": "/v1/admin/devices?status=all&limit=5&offset=0",
    "status": 200,
    "cache_control": "no-store",
    "forbidden_matches": [],
    "top_level_keys": "devices,limit,offset,status"
  },
  {
    "path": "/v1/admin/runs?limit=5&offset=0",
    "status": 200,
    "cache_control": "no-store",
    "forbidden_matches": [],
    "top_level_keys": "runs,limit,offset"
  }
]
```

Forbidden strings checked:

- `summary_json`
- `object_key`
- `hmac_key_ciphertext`
- `hmac_key_nonce`
- `body_sha256`
- `raw`
