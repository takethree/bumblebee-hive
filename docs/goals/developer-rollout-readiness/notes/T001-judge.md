# T001 Judge Receipt

## Decision

Proceed with one docs-only Worker tranche. No Hive API, scanner, installer, scheduled-task, or Bumblebee collection behavior change is justified for this goal.

## Current-State Facts

- Hive repo is on `main` with only the new GoalBuddy board untracked.
- Bumblebee repo is clean on `windows/compat-layer`.
- GitHub release `v0.1.2` is published, not draft, not prerelease.
- The release has `bumblebee_0.1.2_windows_amd64.zip`, `bumblebee_0.1.2_windows_arm64.zip`, and `checksums.txt`.
- Hive `scripts/install-bumblebee.ps1` defaults to `v0.1.2`, downloads GoReleaser-style Windows zip assets from a supplied release base URL, verifies `checksums.txt`, runs `bumblebee.exe selftest`, enrolls with Hive, writes DPAPI-protected local secret material, and can register a scheduled task.
- Hive `scripts/verify-bumblebee-pilot.ps1` supports `CheckOnly`, `Direct`, and `Scheduled`; `CheckOnly` is sufficient for this runbook-hardening slice because the user excluded a new live rollout wave.
- Hive README already has bootstrapper, revocation, operator visibility, and pilot verification sections. It needs a single operator runbook surface that sequences those parts and names the per-user pilot choices.
- Bumblebee `docs/deployment-windows.md` already keeps Hive-specific implementation details out of the scanner docs and points to the companion Hive bootstrapper/verifier. It should receive only a short pointer to the new Hive runbook if docs are touched there.

## Worker Package

Implement a docs-only rollout readiness package:

- Add `docs/developer-rollout-runbook.md` in Hive as the authoritative operator runbook for a per-user developer pilot.
- Link it from Hive `README.md`.
- Add a short generic pointer from Bumblebee `docs/deployment-windows.md` to the Hive runbook, without embedding Hive-specific secrets or TakeThree-only values.
- Optionally add a concise docs-only receipt to Bumblebee `windows.md` if needed to preserve the Windows compatibility-layer audit trail.
- Update this GoalBuddy state with receipts and verification output.

## Required Verification

- `gh release view v0.1.2` against the operator-owned Bumblebee fork, checking `tagName`, `isDraft`, `isPrerelease`, and `assets`
- PowerShell parser checks for `scripts/install-bumblebee.ps1` and `scripts/verify-bumblebee-pilot.ps1`
- Installer `-WhatIf` command using placeholder values and the per-user roots.
- Verifier `-Mode CheckOnly` if local pilot state is available; otherwise record the precise skipped condition.
- `npm test`, `npm run typecheck`, and `npm run lint` in Hive.
- `git diff --check` in every touched repo.
- Sensitive-value searches across touched docs and GoalBuddy receipts.

## Stop Conditions

- Any live secret, raw token, raw device identifier, username, SID, hostname, full local profile path, or raw inventory payload would be printed or committed.
- The work requires live token rotation, second-machine enrollment, or Cloudflare Access policy edits.
- The work requires Hive API, scanner, installer behavior, scheduled-task behavior, or Bumblebee collection semantics changes.
