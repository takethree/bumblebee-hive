# Hive Pilot Runbook And End-To-End Verification

## Intake

- Original request: Prepare GoalBuddy for the next step: Hive pilot runbook and end-to-end scheduled push verification.
- Interpreted outcome: Create an execution board that will make the already-enrolled per-user Bumblebee pilot verifiable and repeatable from local install through Hive operator visibility.
- Input shape: existing_plan.
- Audience: Hive/Bumblebee operators and maintainers.
- Authority: approved.
- Proof type: test and artifact.
- Completion proof: A verifier script and runbook exist, local/live verification passes without leaking secrets or raw inventory, docs are updated, and final receipts prove a fresh Bumblebee run is visible through Hive metadata-only endpoints.

## Goal Oracle

The goal is complete when the Hive repo contains a repeatable pilot verifier that can check local install state, trigger a direct or scheduled Bumblebee run, and prove a fresh completed Hive run through admin visibility endpoints using only redacted metadata.

## Constraints

- Do not re-run or redesign the installer unless validation proves the current install is stale or broken.
- Do not disable, revoke, or uninstall the enrolled device in this tranche.
- Do not add new Hive API endpoints unless the verifier exposes a concrete metadata gap.
- Do not print or commit secrets, raw inventory, raw HTTP payloads, raw device IDs, usernames, SIDs, hostnames, full profile paths, R2 object keys, or `summary_json`.
- Keep Bumblebee docs generic; keep Hive-specific operator commands in the Hive repo.
- Any live evidence must be redacted aggregate evidence only.

## Existing Plan Facts

- The current machine has a per-user Bumblebee install under `%LOCALAPPDATA%\Programs\Bumblebee`.
- The current machine has Hive config/secrets under `%APPDATA%\Bumblebee`.
- The scheduled task is named `Bumblebee Baseline Pilot`.
- The configured Hive target is the pilot Hive `/v1/ingest` URL.
- The next implementation should add `scripts/verify-bumblebee-pilot.ps1`.
- The verifier should support `CheckOnly`, `Direct`, and `Scheduled` modes.
- Hive admin checks should use existing Cloudflare Access plus `X-Hive-Admin-Token` credentials from local DPAPI-protected deployment secrets.
- The verifier output should be redacted JSON only.

## Likely Misfire

The dangerous misfire is treating this as another installer or scanner feature instead of a repeatable operator proof loop. This tranche should not widen Bumblebee's scanner behavior or Hive's data exposure surface.

## Done For This Tranche

Complete the verifier/runbook slice, verify it locally and against live Hive, update receipts/docs, commit and push changed repos, and stop after a final audit confirms the proof loop is repeatable and metadata-only.
