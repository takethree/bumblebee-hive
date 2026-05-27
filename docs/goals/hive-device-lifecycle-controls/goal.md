# Hive Device Lifecycle Controls

## Original Request

`$goalbuddy:goal-prep` after approving a plan for both UI and script device
lifecycle controls in Hive.

## Interpreted Outcome

Prepare and execute a GoalBuddy board that adds audit-backed device disable and
enable controls through both operator script APIs and the Hive admin UI, while
preserving the existing security split between script/admin-token routes and
browser/Access-JWT routes.

## Existing Plan Facts

- Support both UI and script paths.
- Support `disable` and `enable` only in this tranche.
- Do not add delete, full revoke, HMAC rotation, raw inventory browsing, local
  uninstall orchestration, or data purge semantics.
- Existing script/operator routes use Cloudflare Access plus
  `X-Hive-Admin-Token`.
- Existing browser UI routes use validated Cloudflare Access JWTs and must not
  put `ADMIN_TOKEN` in browser JavaScript.
- UI write actions should require a Hive-managed allowlist in addition to
  Cloudflare Access login.
- Use env-driven UI write authorization:
  - `UI_ADMIN_ACTION_EMAILS`: comma-separated exact emails.
  - `UI_ADMIN_ACTION_DOMAINS`: comma-separated email domains.
  - if neither is configured, UI write routes return a safe 403 error.
- UI actions should require a short reason and confirmation.
- Add durable audit events for lifecycle actions.
- Keep all responses metadata-only: no raw inventory, `summary_json`, R2 object
  keys, HMAC material, Access secrets, hostnames, usernames, SIDs, full local
  profile paths, or raw device payloads.

## Goal Oracle

The goal is complete when Hive supports audited device disable and enable from
both script/operator routes and the admin UI, tests prove the auth boundaries
and audit behavior, docs explain both usage paths, and deploy or dry-run proof
shows the implementation remains metadata-only and browser-secret-safe.

## Constraints

- Do not put `ADMIN_TOKEN`, service-token secrets, enrollment tokens, HMAC keys,
  or Hive encryption keys in static assets, browser storage, or UI request
  bodies.
- Do not weaken existing `/v1/admin/*` token requirements.
- Do not make every Access-authenticated dashboard user a write operator unless
  the explicit allowlist authorizes them.
- Do not delete devices, batches, runs, R2 objects, HMAC material, or local
  installer state in this tranche.
- Do not run destructive production lifecycle actions against a real pilot
  device unless a disposable test device is available or the operator explicitly
  authorizes that device.
- Keep UI and script responses metadata-only.

## Likely Misfire

The dangerous wrong success is making lifecycle controls convenient by pushing
an admin token into the browser or by treating disable as revoke/delete. The
board should keep pressure on explicit authorization, auditability, reversible
disable/enable semantics, and no raw data exposure.

## Starter Command

`/goal Follow docs/goals/hive-device-lifecycle-controls/goal.md.`
