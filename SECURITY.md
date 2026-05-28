# Security Policy

## Reporting a vulnerability

Please report security issues using GitHub's private vulnerability reporting
for this repository:

<https://github.com/bradmb/bumblebee-hive/security/advisories/new>

Do not file public issues for security-sensitive findings.

## Supported versions

Only the most recent minor release receives security fixes.

## Threat model

Bumblebee Hive is a Cloudflare Worker receiver for Bumblebee inventory transport
data. It:

- verifies Cloudflare Access service-token headers before device enrollment,
  device ingest, and admin metadata access;
- stores per-device HMAC keys encrypted with `HIVE_KEY_ENCRYPTION_KEY`;
- verifies Bumblebee HMAC signatures against the exact raw request body before
  decompressing gzip payloads;
- stores raw batches in R2 and normalized metadata in D1;
- exposes admin/UI metadata views that intentionally avoid raw inventory,
  secrets, full local paths, hostnames, usernames, SIDs, and raw object keys.

Operators are responsible for protecting Cloudflare account access, Worker
secrets, D1/R2 bindings, enrollment tokens, Access service tokens, and the Hive
admin token.
