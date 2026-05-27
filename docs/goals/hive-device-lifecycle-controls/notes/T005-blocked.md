# T005 Blocked Receipt

## Blocker

The remaining live UI lifecycle proof cannot proceed without operator input and
browser state:

- Production still does not have `UI_ADMIN_ACTION_EMAILS` or
  `UI_ADMIN_ACTION_DOMAINS` configured.
- The operator-approved allowlist value is not inferable safely from the repo or
  deployment secrets.
- A live UI write smoke requires an authenticated browser Access session whose
  JWT contains an allowlisted email actor claim.
- The Codex Chrome Extension is not installed in the detected Chrome profile,
  so this session cannot automate the authenticated browser flow.

## Current Proven State

- Script lifecycle proof is complete and recorded.
- Remote D1 lifecycle migration was applied.
- Worker and admin UI were deployed.
- Tests, dry-runs, static scans, and non-destructive live route smoke passed.
- A disposable script lifecycle smoke proved `disable,enable,disable` with
  three audit events and zero forbidden field matches.

## Required To Resume

Provide one of:

- exact email(s) for `UI_ADMIN_ACTION_EMAILS`, or
- domain(s) for `UI_ADMIN_ACTION_DOMAINS`.

Then provide either:

- an authenticated browser Access session for an allowlisted actor, or
- a working Codex Chrome Extension setup so the UI smoke can be automated.

The UI disable/enable smoke must target a disposable enrolled device or a device
explicitly approved by the operator.
