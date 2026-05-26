# Bumblebee Hive

Bumblebee Hive is a Cloudflare Worker receiver for Bumblebee inventory transport data.

The v0.1 receiver is intentionally small:

- protects `/v1/enroll` and `/v1/ingest` with Cloudflare Access service-token headers;
- accepts the Cloudflare Access JWT forwarded to the Worker after Access
  authenticates the request;
- verifies Bumblebee HMAC signatures against the exact raw request body;
- decompresses gzip only after HMAC verification;
- stores accepted raw batches in R2;
- stores device, batch, and run indexes in D1;
- queues accepted batches for later normalization.

It is designed to run in an operator-owned Cloudflare account. It does not require developer machines to hold object-storage credentials.

## Local Development

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Create the D1 schema with:

```powershell
wrangler d1 migrations apply bumblebee-hive --local
```

Production deployment requires real Cloudflare resource IDs and secrets in `wrangler.toml` / Wrangler secrets.

## Windows Bootstrapper

The self-service installer downloads Bumblebee, verifies the release checksum,
enrolls the endpoint with Hive, stores secrets with Windows DPAPI-backed
`Export-Clixml`, writes a scheduled-run wrapper, and optionally registers a
current-user scheduled task.

Dry-run the installer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-bumblebee.ps1 `
  -HiveBaseUrl https://hive.example.com `
  -AccessClientId $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_ID `
  -AccessClientSecret $env:BUMBLEBEE_HIVE_ACCESS_CLIENT_SECRET `
  -WhatIf
```

For a real download install, pass the release base URL for the Bumblebee
release source you operate:

```powershell
-ReleaseBaseUrl https://github.com/<owner>/bumblebee/releases/download
```

The generated wrapper passes gateway headers through Bumblebee's generic
`--http-header-env` support and uses Bumblebee HMAC for payload integrity.
The default generated scan profile is `baseline`; tests and bounded campaign
installs can pass `-ScanProfile project -ScanRoot <path>`.
