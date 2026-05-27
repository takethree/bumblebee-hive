# Hive Normalized Inventory V1

## Intake

- Original request: `$goalbuddy:goal-prep` after approving the Hive normalized inventory direction.
- Interpreted outcome: Prepare a GoalBuddy board to turn accepted Bumblebee batches into structured, queryable Hive inventory data and operator views.
- Input shape: existing_plan.
- Audience: Hive/Bumblebee operators and maintainers.
- Authority: approved for board preparation; execution starts only after `/goal`.
- Proof type: test, artifact, and live smoke when safe.
- Completion proof: Normalized package/finding data is written from accepted batches, current state follows Bumblebee promotion rules, admin/UI inventory views work, tests pass, docs are updated, and a redacted smoke proves fresh pilot data becomes queryable without exposing raw payloads or secrets.

## Goal Oracle

The tranche is complete when Hive can answer controlled inventory questions from normalized D1 data: which packages are present, which devices have a package, and what packages are on a device, while preserving the existing raw-batch source of truth and auth boundaries.

## Existing Plan Facts

- This is not an admin settings or allowlist-management goal.
- Build a normalizer that consumes `NORMALIZE_QUEUE` messages for accepted batches.
- Normalize Bumblebee `package` and `finding` records from raw R2 batch objects into D1 tables.
- Promote current package state only after a matching `scan_summary.status = complete`.
- `baseline` and `project` can contribute to current package state; `deep` is evidence/campaign data and must not retire current packages.
- Add admin-token and browser-Access inventory APIs for package search and device package lists.
- Add an admin UI inventory view and package list on device detail.
- Keep raw payload JSON, hostnames, usernames, SIDs, full profile paths, R2 object keys, HMAC material, and secrets out of operator responses and receipts.

## Constraints

- Do not change Bumblebee scanner output semantics in this tranche.
- Do not build AI automation, user provisioning, vulnerability enrichment, or settings management in this tranche.
- Do not expose raw R2 batch objects, `summary_json`, full source paths, project paths, endpoint hostnames, endpoint usernames, SIDs, HMAC material, Access secrets, enrollment tokens, or local profile paths through admin/UI routes.
- Preserve existing `/v1/admin/*` token-protected script/operator API behavior and `/v1/ui/admin/*` browser Access JWT behavior.
- Any schema migration must be additive and safe to apply to the existing live Hive database.
- Queue processing must be idempotent because duplicate queue delivery is possible.
- Retention behavior must not accidentally delete normalized data needed by current operator views unless a deliberate retention policy is added and verified.

## Likely Misfire

The dangerous wrong success is exposing raw inventory or path-heavy payloads through a convenient UI, or implementing a narrow table write that does not follow Bumblebee's complete-run promotion model. The board should keep pressure on source-of-truth preservation, data minimization, idempotence, and useful operator questions.

## Done For This Tranche

Complete one end-to-end normalized inventory slice: schema, queue normalization, current-state promotion, controlled APIs, UI visibility, docs, tests, dry-run/deploy validation, and redacted smoke evidence when safe.
