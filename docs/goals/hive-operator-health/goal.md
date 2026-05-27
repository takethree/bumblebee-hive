# Hive Operator Health

## Original Request

`$goalbuddy:goal-prep` after agreeing on an operator-health plan for Hive.

## Interpreted Outcome

Prepare and execute a GoalBuddy board that adds a generic, configurable,
metadata-only health layer to the Hive admin UI so operators can understand
recurring Bumblebee baseline run health without reading the raw run stream.

## Existing Plan Facts

- Monitor `baseline` first.
- Keep the implementation generic; do not bake in Take3-specific assumptions.
- Make health configuration environment-driven:
  - `HEALTH_PROFILE`, default `baseline`
  - `HEALTH_EXPECTED_CADENCE_HOURS`, default `6`
  - `HEALTH_STALE_HOURS`, default `24`
  - `HEALTH_WEEKEND_GRACE_HOURS`, default `72`
- Use a weekend grace model because developer laptops may be shut down over
  weekends.
- Keep the admin UI browser path tokenless: Cloudflare Access JWT only for
  `/v1/ui/admin/*`; no browser-held `ADMIN_TOKEN`.
- Keep responses metadata-only: no raw inventory, `summary_json`, R2 object
  keys, HMAC material, Access secrets, hostnames, usernames, SIDs, or full
  local profile paths.

## Goal Oracle

The goal is complete when the deployed Hive admin UI exposes baseline operator
health with configurable cadence/stale/weekend-grace thresholds; tests prove
healthy, stale, attention, and unknown classifications; docs describe the
generic configuration; and live or dry-run evidence shows the new UI/API remains
metadata-only and protected by the existing UI auth boundary.

## Constraints

- Do not add raw inventory browsing.
- Do not add disable/revoke UI actions in this tranche.
- Do not put `ADMIN_TOKEN`, service-token secrets, enrollment tokens, HMAC keys,
  or Hive encryption keys in browser JavaScript.
- Do not weaken existing `/v1/admin/*` token requirements.
- Do not add Take3-specific URLs, tenant names, user identities, device IDs,
  hostnames, tokens, or local paths.
- Prefer one coherent Worker package once the plan is validated.

## Likely Misfire

The dangerous wrong success is building a visual health dashboard that either
hardcodes the current pilot's laptop habits or exposes sensitive run/device
details. The board should keep pressure on generic configuration, metadata-only
responses, and clear operator signal instead of more raw run rows.

## Starter Command

`/goal Follow docs/goals/hive-operator-health/goal.md.`
