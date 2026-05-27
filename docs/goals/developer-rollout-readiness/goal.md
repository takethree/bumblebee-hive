# Developer Rollout Readiness And Enrollment Wave Runbook

## Original Request

`$goalbuddy:goal-prep` after approving a plan for developer rollout readiness and enrollment wave runbook hardening.

## Interpreted Outcome

Prepare a GoalBuddy board for a runbook-hardening slice that makes the Bumblebee + Hive developer pilot install path understandable, repeatable, and safe for a small per-user rollout without doing the rollout work during prep.

## Chosen Direction

- Rollout target: runbook hardening.
- Install shape: per-user pilot.
- Token handling: operator rotation checklist.
- Excluded from this slice: second-machine pilot, small-wave enrollment, live token rotation, and any production policy changes.

## Goal Oracle

The goal is complete only when a developer/operator can follow a documented per-user pilot runbook using the published Bumblebee `v0.1.2` Windows release, placeholder Cloudflare Access service-token headers, the existing enrollment secret process, and the CheckOnly verifier without needing to infer local paths or hidden configuration.

Final proof must include:

- A dedicated Hive-side rollout or developer pilot runbook, linked from the right docs surface.
- A minimal Bumblebee-side deployment pointer if Judge confirms it is needed for discoverability.
- Redacted receipts showing release assumptions, installer command shape, verifier command shape, and doc-sensitive-value checks.
- Verification output for relevant Hive checks and any touched Bumblebee doc checks.
- Confirmation that no live token rotation, second-machine enrollment, scanner changes, Hive API changes, or installer semantics changes were performed.

## Constraints

- Treat this as documentation and rollout-readiness work only unless the first Judge task proves a code change is required.
- Keep the compatibility-layer boundary intact: Bumblebee changes should stay generic and maintainable; Hive-specific operator details belong in the Hive repo.
- Do not print, commit, or summarize raw secrets, access client secrets, enrollment tokens, raw hostnames, usernames, SIDs, full local profile paths, raw inventory payloads, or raw device identifiers.
- Use placeholders for Cloudflare Access and Hive enrollment values.
- Do not rotate live credentials in this goal.
- Do not enroll another machine in this goal.
- Do not change Hive transport, scanner behavior, scheduled task behavior, installer semantics, or Bumblebee collection semantics unless Judge explicitly declares the docs impossible without that change.
- Preserve the current per-user pilot shape: install under `%LOCALAPPDATA%\Programs\Bumblebee`, config under `%APPDATA%\Bumblebee`, scheduled task named `Bumblebee Baseline Pilot`.
- Keep proof source-backed and command-backed; do not mark complete based on prose alone.

## Known Starting Facts

- Bumblebee release `v0.1.2` was observed as published with Windows amd64 and arm64 zip assets plus `checksums.txt`.
- `scripts/install-bumblebee.ps1` defaults to Bumblebee `v0.1.2` and supports per-user roots and `-WhatIf`.
- `scripts/verify-bumblebee-pilot.ps1` already exists and previously verified CheckOnly and scheduled pilot paths.
- Prior Hive and Bumblebee working trees were clean before this prep.
- GoalBuddy dedicated agents are bundled with the plugin but not installed into the user or repo agent directories.

## Likely Misfire

The main failure mode is producing a polished runbook that looks complete but either leaks environment-specific values, assumes hidden operator setup, or quietly expands into a new deployment mechanism. The board should keep pressure on redaction, repeatability, and compatibility-layer boundaries.

## Starter Command

`/goal Follow docs/goals/developer-rollout-readiness/goal.md.`
