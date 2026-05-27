# T004 Script Live Smoke

## Completed Evidence

Ran a redacted live script lifecycle smoke against a disposable enrolled device.
The raw device ID, enrollment response secret material, and token values were
not printed or recorded.

- `POST /v1/enroll` returned `201`.
- `POST /v1/admin/devices/<redacted>/disable` returned `200`.
- `POST /v1/admin/devices/<redacted>/enable` returned `200`.
- Final `POST /v1/admin/devices/<redacted>/disable` returned `200` so the
  disposable smoke device is left disabled.
- `GET /v1/admin/devices/<redacted>` returned `200`.
- Admin detail response included `Cache-Control: no-store`.
- Final redacted device status: `disabled`.
- Lifecycle event count: `3`.
- Lifecycle action sequence: `disable,enable,disable`.
- Forbidden field match count in the admin detail response: `0`.

## Remaining Condition

The live UI write smoke is still pending. Production still needs
`UI_ADMIN_ACTION_EMAILS` or `UI_ADMIN_ACTION_DOMAINS`, plus an authenticated
browser Access session whose JWT contains an allowlisted email actor claim.
Service-token Access smoke is intentionally insufficient for UI writes.
