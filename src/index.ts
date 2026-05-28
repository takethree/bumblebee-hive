import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface Env {
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_TOKEN: string;
  ENROLLMENT_TOKEN: string;
  HIVE_KEY_ENCRYPTION_KEY: string;
  RAW_BATCHES: R2Bucket;
  DB: D1Database;
  ASSETS?: Fetcher;
  NORMALIZE_QUEUE?: Queue;
  MAX_BODY_BYTES?: string;
  TIMESTAMP_SKEW_SECONDS?: string;
  RETENTION_DAYS?: string;
  RETENTION_DELETE_LIMIT?: string;
  HEALTH_PROFILE?: string;
  HEALTH_EXPECTED_CADENCE_HOURS?: string;
  HEALTH_STALE_HOURS?: string;
  HEALTH_WEEKEND_GRACE_HOURS?: string;
  NORMALIZATION_PROCESSING_STALE_MINUTES?: string;
  UI_ADMIN_ACTION_EMAILS?: string;
  UI_ADMIN_ACTION_DOMAINS?: string;
  CATALOG_UPSTREAM_SYNC_ENABLED?: string;
  CATALOG_UPSTREAM_CONTENTS_URL?: string;
  CATALOG_UPSTREAM_SOURCE?: string;
  CATALOG_UPSTREAM_FILE_LIMIT?: string;
}

interface InventoryRecord {
  record_type?: string;
  record_id?: string;
  schema_version?: string;
  run_id?: string;
  profile?: string;
  scanner_name?: string;
  scanner_version?: string;
  scan_time?: string;
  status?: string;
  ecosystem?: string;
  package_name?: string;
  normalized_name?: string;
  version?: string;
  root_kind?: string;
  install_scope?: string;
  package_manager?: string;
  source_type?: string;
  direct_dependency?: boolean;
  has_lifecycle_scripts?: boolean;
  confidence?: string;
  requested_spec?: string;
  server_name?: string;
  finding_type?: string;
  severity?: string;
  catalog_id?: string;
  catalog_name?: string;
  evidence?: string;
  endpoint?: {
    device_id?: string;
  };
}

interface DeviceRow {
  hmac_key_ciphertext: string;
  hmac_key_nonce: string;
}

interface AdminOverviewRow {
  total_devices: number;
  active_devices: number;
  disabled_devices: number;
}

interface AdminRunOverviewRow {
  total_runs: number;
  complete_runs: number | null;
  latest_run_received_at: string | null;
}

interface AdminBatchTotalRow {
  total_batches: number;
  total_records: number | null;
}

interface AdminDeviceRow {
  device_id: string;
  environment: DeviceEnvironment;
  created_at: string;
  disabled_at: string | null;
  run_count: number;
  batch_count: number;
  record_count: number | null;
  last_run_id: string | null;
  last_run_profile: string | null;
  last_run_status: string | null;
  last_run_scanner_version: string | null;
  last_run_received_at: string | null;
}

interface AdminRunRow {
  device_id: string;
  run_id: string;
  profile: string;
  status: string;
  scanner_version: string | null;
  received_at: string;
  batch_count: number;
  record_count: number | null;
}

interface AdminHealthRow {
  device_id: string;
  environment: DeviceEnvironment;
  created_at: string;
  last_run_id: string | null;
  last_run_status: string | null;
  last_run_scanner_version: string | null;
  last_run_received_at: string | null;
  last_complete_run_id: string | null;
  last_complete_received_at: string | null;
}

interface AdminLifecycleEventRow {
  event_id: string;
  device_id: string;
  action: LifecycleAction;
  actor_type: string;
  actor_id: string;
  reason: string;
  previous_disabled_at: string | null;
  new_disabled_at: string | null;
  created_at: string;
}

interface AdminNormalizationJobRow {
  batch_id: string;
  device_id: string;
  run_id: string;
  status: string;
  records_seen: number;
  packages_seen: number;
  findings_seen: number;
  promoted_current: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface AdminFindingRow {
  device_id: string;
  environment?: DeviceEnvironment;
  run_id: string;
  record_id: string;
  profile: string;
  finding_type: string;
  severity: string | null;
  catalog_id: string;
  catalog_name: string | null;
  ecosystem: string;
  package_name: string;
  normalized_name: string;
  version: string | null;
  root_kind: string | null;
  source_type: string | null;
  confidence: string | null;
  evidence: string | null;
  received_at: string;
}

interface RetentionBatchRow {
  batch_id: string;
  object_key: string;
}

interface DevicePurgeBatchRow {
  batch_id: string;
  object_key: string;
}

interface DevicePurgeTargetRow {
  device_id: string;
  environment: DeviceEnvironment;
  disabled_at: string | null;
}

interface DevicePurgeCounts {
  raw_objects: number;
  batches: number;
  runs: number;
  normalization_jobs: number;
  inventory_records: number;
  inventory_current: number;
  exposure_findings: number;
  lifecycle_events: number;
  devices: number;
}

interface RetentionRunRow {
  device_id: string;
  profile: string;
  run_id: string;
}

interface NormalizeQueueMessage {
  device_id?: string;
  run_id?: string;
  batch_id?: string;
}

interface NormalizationBatchRow {
  batch_id: string;
  device_id: string;
  run_id: string;
  received_at: string;
  content_encoding: string | null;
  object_key: string;
  summary_status: string | null;
}

interface NormalizationRunRow {
  profile: string;
  status: string;
  scanner_version: string | null;
  received_at: string;
}

interface NormalizedPackageRow {
  device_id: string;
  profile: string;
  record_id: string;
  run_id: string;
  schema_version: string | null;
  scanner_version: string | null;
  scan_time: string | null;
  ecosystem: string;
  package_name: string;
  normalized_name: string;
  version: string | null;
  root_kind: string | null;
  install_scope: string | null;
  package_manager: string | null;
  source_type: string | null;
  direct_dependency: number | null;
  has_lifecycle_scripts: number;
  confidence: string | null;
  requested_spec: string | null;
  server_name: string | null;
  observed_at: string;
}

interface NormalizedPackageSummaryRow {
  device_id: string;
  profile: string;
  ecosystem: string;
  package_name: string;
  normalized_name: string;
  version: string | null;
  occurrence_count: number;
  package_managers: string | null;
  source_types: string | null;
  root_kinds: string | null;
  direct_dependency_present: number | null;
  has_lifecycle_scripts: number | null;
  latest_observed_at: string;
  latest_run_id: string | null;
}

interface NormalizedPackageFamilyRow {
  device_id: string;
  profile: string;
  ecosystem: string;
  package_name: string;
  normalized_name: string;
  version_count: number;
  total_occurrence_count: number;
  package_managers: string | null;
  source_types: string | null;
  root_kinds: string | null;
  direct_dependency_present: number | null;
  has_lifecycle_scripts: number | null;
  latest_observed_at: string;
  latest_run_id: string | null;
}

type PackageView = "package" | "summary" | "observations";

interface PackageDetailAccumulator {
  package_name: string;
  normalized_name: string;
  ecosystem: string;
  profiles: Set<string>;
  devices: Set<string>;
  versions: Set<string>;
  total_occurrence_count: number;
  package_managers: Set<string>;
  source_types: Set<string>;
  root_kinds: Set<string>;
  direct_dependency_seen: boolean;
  direct_dependency_present: boolean;
  has_lifecycle_scripts: boolean;
  latest_observed_at: string;
  latest_run_id: string | null;
}

interface PackageDetailVersionAccumulator {
  version: string | null;
  devices: Set<string>;
  occurrence_count: number;
  package_managers: Set<string>;
  source_types: Set<string>;
  root_kinds: Set<string>;
  direct_dependency_seen: boolean;
  direct_dependency_present: boolean;
  has_lifecycle_scripts: boolean;
  latest_observed_at: string;
  latest_run_id: string | null;
}

interface PackageDetailDeviceAccumulator {
  device_id: string;
  profile: string;
  versions: Set<string>;
  total_occurrence_count: number;
  package_managers: Set<string>;
  source_types: Set<string>;
  root_kinds: Set<string>;
  direct_dependency_seen: boolean;
  direct_dependency_present: boolean;
  has_lifecycle_scripts: boolean;
  latest_observed_at: string;
  latest_run_id: string | null;
}

interface NormalizationResult {
  recordsSeen: number;
  packagesSeen: number;
  findingsSeen: number;
  promotedCurrent: boolean;
}

interface CatalogPublishBody {
  source?: string;
  files?: Array<{
    path?: string;
    content?: string;
  }>;
}

interface CatalogFileCandidate {
  path: string;
  content: string;
  sha256: string;
  entryCount: number;
}

interface CatalogPublishInputFile {
  path?: string;
  content?: string;
}

interface CatalogReleaseRow {
  release_id: string;
  source: string | null;
  schema_version: string;
  file_count: number;
  entry_count: number;
  bundle_sha256: string;
  published_at: string;
}

interface CatalogFileRow {
  release_id: string;
  path: string;
  sha256: string;
  entry_count: number;
  content_json: string;
}

interface UpstreamContentItem {
  type?: string;
  name?: string;
  path?: string;
  download_url?: string | null;
  size?: number;
}

interface CountRow {
  total: number;
}

interface CountByValueRow {
  value: string | null;
  total: number;
}

interface ValidatedRecords {
  runID: string;
  summary: InventoryRecord | null;
}

interface IngestOptions {
  requireAccess: boolean;
  deviceID?: string;
}

const signatureHeader = "X-Inventory-Signature";
const timestampHeader = "X-Inventory-Timestamp";
const deviceHeader = "X-Inventory-Device-Id";
const accessClientIDHeader = "CF-Access-Client-Id";
const accessClientSecretHeader = "CF-Access-Client-Secret";
const accessJWTHeader = "Cf-Access-Jwt-Assertion";
const adminTokenHeader = "X-Hive-Admin-Token";
const defaultMaxBodyBytes = 5 * 1024 * 1024;
const defaultTimestampSkewSeconds = 300;
const defaultRetentionDays = 30;
const defaultRetentionDeleteLimit = 100;
const defaultHealthProfile = "baseline";
const defaultHealthExpectedCadenceHours = 6;
const defaultHealthStaleHours = 24;
const defaultHealthWeekendGraceHours = 72;
const defaultNormalizationProcessingStaleMinutes = 30;
const defaultCatalogUpstreamContentsURL = "https://api.github.com/repos/perplexityai/bumblebee/contents/threat_intel?ref=main";
const defaultCatalogUpstreamSource = "perplexityai/bumblebee/threat_intel";
const defaultCatalogUpstreamFileLimit = 100;
const accessJWKSByURL = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type LifecycleAction = "disable" | "enable";
type DeviceEnvironment = "production" | "test";
type EnvironmentFilterValue = DeviceEnvironment | "all";

function parseDeviceEnvironment(value: unknown, fallback: DeviceEnvironment = "production"): DeviceEnvironment {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) {
    return fallback;
  }
  if (raw === "production" || raw === "test") {
    return raw;
  }
  throw new HttpError(400, "invalid_device_environment");
}

function environmentFilter(url: URL): EnvironmentFilterValue {
  const raw = (url.searchParams.get("environment") || "production").trim().toLowerCase();
  if (raw === "production" || raw === "test" || raw === "all") {
    return raw;
  }
  throw new HttpError(400, "invalid_environment_filter");
}

function addEnvironmentFilter(
  where: string[],
  values: (string | number)[],
  environment: EnvironmentFilterValue,
  deviceColumn: string
): void {
  if (environment === "all") {
    return;
  }
  where.push(`EXISTS (SELECT 1 FROM devices env_d WHERE env_d.device_id = ${deviceColumn} AND env_d.environment = ?)`);
  values.push(environment);
}

interface LifecycleActor {
  type: "script" | "ui";
  id: string;
}

interface UIAdminActor extends LifecycleActor {
  type: "ui";
  email: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/admin") {
        return new Response(null, { status: 302, headers: { Location: "/admin/" } });
      }
      if (request.method === "GET" && url.pathname.startsWith("/admin/")) {
        return await serveAdminAsset(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/health") {
        return json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/v1/enroll") {
        return await enroll(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/ingest") {
        return await ingest(request, env, { requireAccess: true });
      }
      const compatIngestMatch = url.pathname.match(/^\/v1\/compat\/ingest\/([^/]+)$/);
      if (request.method === "POST" && compatIngestMatch) {
        return await ingest(request, env, {
          requireAccess: false,
          deviceID: decodePathSegment(compatIngestMatch[1])
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/catalog/current") {
        return await deviceCurrentCatalog(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/catalog/current") {
        return await adminCurrentCatalog(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/catalog/current") {
        return await adminPublishCatalog(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/catalog/sync-upstream") {
        return await adminSyncCatalogUpstream(request, env);
      }
      const disableMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/disable$/);
      if (request.method === "POST" && disableMatch) {
        return await disableDevice(request, env, disableMatch[1]);
      }
      const enableMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/enable$/);
      if (request.method === "POST" && enableMatch) {
        return await enableDevice(request, env, enableMatch[1]);
      }
      const purgeMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/purge$/);
      if (request.method === "POST" && purgeMatch) {
        return await purgeDevice(request, env, purgeMatch[1], url);
      }
      const uiLifecycleMatch = url.pathname.match(/^\/v1\/ui\/admin\/devices\/([^/]+)\/(disable|enable)$/);
      if (request.method === "POST" && uiLifecycleMatch) {
        return await uiDeviceLifecycle(request, env, uiLifecycleMatch[1], uiLifecycleMatch[2] as LifecycleAction);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/retention/run") {
        return await runRetentionAdmin(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/overview") {
        return await adminOverview(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/overview") {
        return await uiAdminOverview(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/attention") {
        return await adminAttention(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/attention") {
        return await uiAdminAttention(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/health") {
        return await uiAdminHealth(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/devices") {
        return await adminDevices(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/devices") {
        return await uiAdminDevices(request, env, url);
      }
      const deviceMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)$/);
      if (request.method === "GET" && deviceMatch) {
        return await adminDeviceDetail(request, env, deviceMatch[1]);
      }
      const uiDeviceMatch = url.pathname.match(/^\/v1\/ui\/admin\/devices\/([^/]+)$/);
      if (request.method === "GET" && uiDeviceMatch) {
        return await uiAdminDeviceDetail(request, env, uiDeviceMatch[1]);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/runs") {
        return await adminRuns(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/runs") {
        return await uiAdminRuns(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/normalization-jobs") {
        return await adminNormalizationJobs(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/normalization-jobs") {
        return await uiAdminNormalizationJobs(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/findings") {
        return await adminFindings(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/findings") {
        return await uiAdminFindings(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/packages/detail") {
        return await adminPackageDetail(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/packages/detail") {
        return await uiAdminPackageDetail(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/packages") {
        return await adminPackages(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/packages") {
        return await uiAdminPackages(request, env, url);
      }
      const devicePackagesMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/packages$/);
      if (request.method === "GET" && devicePackagesMatch) {
        return await adminDevicePackages(request, env, devicePackagesMatch[1], url);
      }
      const uiDevicePackagesMatch = url.pathname.match(/^\/v1\/ui\/admin\/devices\/([^/]+)\/packages$/);
      if (request.method === "GET" && uiDevicePackagesMatch) {
        return await uiAdminDevicePackages(request, env, uiDevicePackagesMatch[1], url);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "internal_error";
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: message }, status);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRetention(env, { dryRun: false }));
    if (catalogUpstreamSyncEnabled(env)) {
      ctx.waitUntil(syncCatalogFromUpstream(env));
    }
  },

  async queue(batch: MessageBatch<NormalizeQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await normalizeQueuedBatch(env, message.body);
    }
  }
};

async function serveAdminAsset(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ASSETS) {
    throw new HttpError(404, "admin_ui_not_configured");
  }
  if (isAdminShellRoute(url.pathname)) {
    const shellURL = new URL(url);
    shellURL.pathname = "/admin/";
    return env.ASSETS.fetch(new Request(shellURL, request));
  }
  return env.ASSETS.fetch(new Request(url, request));
}

function isAdminShellRoute(pathname: string): boolean {
  return pathname === "/admin/" || /^\/admin\/devices\/[^/]+\/?$/.test(pathname);
}

async function enroll(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  const token = request.headers.get("X-Hive-Enroll-Token");
  if (!token || !constantTimeEqual(token, env.ENROLLMENT_TOKEN)) {
    throw new HttpError(401, "invalid_enrollment_token");
  }

  const body = await readOptionalJson<{ device_id?: string; environment?: string }>(request);
  const deviceID = sanitizeDeviceID(body.device_id || "") || crypto.randomUUID();
  const deviceEnvironment = parseDeviceEnvironment(body.environment);
  const hmacKey = bytesToBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const encrypted = await encryptSecret(env, hmacKey);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO devices (device_id, hmac_key_ciphertext, hmac_key_nonce, created_at, disabled_at, environment) VALUES (?, ?, ?, ?, NULL, ?)"
  ).bind(deviceID, encrypted.ciphertext, encrypted.nonce, now, deviceEnvironment).run();

  return json({
    device_id: deviceID,
    environment: deviceEnvironment,
    hmac_key: hmacKey,
    ingest_path: "/v1/ingest",
    upstream_ingest_path: `/v1/compat/ingest/${encodeURIComponent(deviceID)}`,
    required_headers: [accessClientIDHeader, accessClientSecretHeader, deviceHeader]
  }, 201);
}

async function ingest(request: Request, env: Env, options: IngestOptions): Promise<Response> {
  if (options.requireAccess) {
    requireAccess(request, env);
  }
  requireContentType(request);

  const deviceID = sanitizeDeviceID(options.deviceID || request.headers.get(deviceHeader) || "");
  if (!deviceID) {
    throw new HttpError(400, "missing_device_id");
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const maxBodyBytes = positiveInt(env.MAX_BODY_BYTES, defaultMaxBodyBytes);
  if (rawBody.byteLength === 0) {
    throw new HttpError(400, "empty_body");
  }
  if (rawBody.byteLength > maxBodyBytes) {
    throw new HttpError(413, "body_too_large");
  }

  const device = await loadDevice(env, deviceID);
  const hmacKey = await decryptSecret(env, device);
  await verifyInventorySignature(request, rawBody, hmacKey, env);

  const encoding = request.headers.get("Content-Encoding") || "";
  const ndjson = encoding.toLowerCase() === "gzip"
    ? await gunzipToText(rawBody)
    : new TextDecoder().decode(rawBody);
  if (encoding && encoding.toLowerCase() !== "gzip") {
    throw new HttpError(415, "unsupported_content_encoding");
  }

  const records = parseNDJSON(ndjson);
  const validated = validateRecords(records, deviceID);
  const { runID, summary } = validated;
  const batchID = await sha256Hex(rawBody);
  const receivedAt = new Date().toISOString();
  const objectKey = `${deviceID}/${runID}/${batchID}.ndjson${encoding ? ".gz" : ""}`;

  await env.RAW_BATCHES.put(objectKey, rawBody, {
    httpMetadata: { contentType: "application/x-ndjson", contentEncoding: encoding || undefined },
    customMetadata: {
      device_id: deviceID,
      run_id: runID,
      batch_id: batchID,
      received_at: receivedAt
    }
  });

  await env.DB.prepare(
    "INSERT INTO batches (batch_id, device_id, run_id, received_at, content_encoding, object_key, body_sha256, record_count, summary_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(batchID, deviceID, runID, receivedAt, encoding || null, objectKey, batchID, records.length, summary?.status || null).run();

  if (summary) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO runs (device_id, profile, run_id, status, scanner_version, received_at, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(deviceID, summary.profile || "", runID, summary.status || "", summary.scanner_version || null, receivedAt, JSON.stringify(summary)).run();
  }

  if (env.NORMALIZE_QUEUE) {
    await env.NORMALIZE_QUEUE.send({ device_id: deviceID, run_id: runID, batch_id: batchID });
  }

  return json({ ok: true, batch_id: batchID, run_id: runID, records: records.length, run_complete: summary !== null });
}

async function adminPublishCatalog(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);
  const body = await readOptionalJson<CatalogPublishBody>(request);
  const bundle = await publishCatalogFiles(env, body.files || [], textOrNull(body.source));
  return adminJson({ ok: true, catalog: bundle?.manifest }, 201);
}

async function adminSyncCatalogUpstream(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);
  const bundle = await syncCatalogFromUpstream(env);
  return adminJson({ ok: true, catalog: bundle?.manifest }, 201);
}

async function publishCatalogFiles(env: Env, inputFiles: CatalogPublishInputFile[], source: string | null): Promise<{ manifest: object; files: object[] } | null> {
  const files = await validateCatalogFiles(inputFiles);
  const schemaVersion = "0.1.0";
  const entryCount = files.reduce((total, file) => total + file.entryCount, 0);
  const bundlePayload = files.map((file) => `${file.path}\u0000${file.sha256}`).join("\n");
  const bundleSHA = await sha256Hex(new TextEncoder().encode(bundlePayload));
  const releaseID = `catalog-${bundleSHA.slice(0, 32)}`;
  const publishedAt = new Date().toISOString();

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT OR REPLACE INTO catalog_releases (release_id, source, schema_version, file_count, entry_count, bundle_sha256, published_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
    ).bind(releaseID, source, schemaVersion, files.length, entryCount, bundleSHA, publishedAt),
    env.DB.prepare("DELETE FROM catalog_files WHERE release_id = ?").bind(releaseID)
  ];
  for (const file of files) {
    statements.push(env.DB.prepare(
      "INSERT INTO catalog_files (release_id, path, sha256, entry_count, content_json) VALUES (?, ?, ?, ?, ?)"
    ).bind(releaseID, file.path, file.sha256, file.entryCount, file.content));
  }
  statements.push(
    env.DB.prepare("UPDATE catalog_releases SET active = 0 WHERE active = 1"),
    env.DB.prepare("UPDATE catalog_releases SET active = 1 WHERE release_id = ?").bind(releaseID)
  );
  await runStatements(env, statements);

  return currentCatalogBundle(env);
}

async function adminCurrentCatalog(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);
  const bundle = await currentCatalogBundle(env);
  if (!bundle) {
    throw new HttpError(404, "catalog_not_found");
  }
  return adminJson(bundle);
}

async function deviceCurrentCatalog(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  const deviceID = sanitizeDeviceID(request.headers.get(deviceHeader) || "");
  if (!deviceID) {
    throw new HttpError(400, "missing_device_id");
  }
  await loadDevice(env, deviceID);
  const bundle = await currentCatalogBundle(env);
  if (!bundle) {
    throw new HttpError(404, "catalog_not_found");
  }
  return adminJson(bundle);
}

async function validateCatalogFiles(inputFiles: CatalogPublishInputFile[]): Promise<CatalogFileCandidate[]> {
  if (inputFiles.length === 0) {
    throw new HttpError(400, "catalog_files_required");
  }
  if (inputFiles.length > 100) {
    throw new HttpError(400, "too_many_catalog_files");
  }
  const seen = new Set<string>();
  const files: CatalogFileCandidate[] = [];
  for (const input of inputFiles) {
    const path = safeCatalogFilePath(input.path || "");
    if (!path) {
      throw new HttpError(400, "invalid_catalog_path");
    }
    if (seen.has(path)) {
      throw new HttpError(400, "duplicate_catalog_path");
    }
    seen.add(path);
    const content = input.content || "";
    if (new TextEncoder().encode(content).byteLength > 1024 * 1024) {
      throw new HttpError(413, "catalog_file_too_large");
    }
    const entryCount = validateCatalogContent(content);
    files.push({
      path,
      content,
      sha256: await sha256Hex(new TextEncoder().encode(content)),
      entryCount
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

async function syncCatalogFromUpstream(env: Env): Promise<{ manifest: object; files: object[] } | null> {
  const contentsURL = env.CATALOG_UPSTREAM_CONTENTS_URL || defaultCatalogUpstreamContentsURL;
  const source = textOrNull(env.CATALOG_UPSTREAM_SOURCE) || defaultCatalogUpstreamSource;
  const limit = positiveInt(env.CATALOG_UPSTREAM_FILE_LIMIT, defaultCatalogUpstreamFileLimit);
  const listingResponse = await fetch(contentsURL, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "bumblebee-hive"
    }
  });
  if (!listingResponse.ok) {
    throw new HttpError(502, "catalog_upstream_list_failed");
  }
  const listing = await listingResponse.json() as unknown;
  if (!Array.isArray(listing)) {
    throw new HttpError(502, "catalog_upstream_list_invalid");
  }
  const catalogFiles = (listing as UpstreamContentItem[])
    .filter((item) => item.type === "file" && item.name?.endsWith(".json") && item.download_url)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)))
    .slice(0, limit);
  if (catalogFiles.length === 0) {
    throw new HttpError(502, "catalog_upstream_empty");
  }
  const files: CatalogPublishInputFile[] = [];
  for (const item of catalogFiles) {
    const path = safeCatalogFilePath(item.name || "");
    if (!path) {
      throw new HttpError(502, "catalog_upstream_invalid_path");
    }
    const contentResponse = await fetch(String(item.download_url), {
      headers: { "User-Agent": "bumblebee-hive" }
    });
    if (!contentResponse.ok) {
      throw new HttpError(502, "catalog_upstream_file_failed");
    }
    files.push({ path, content: await contentResponse.text() });
  }
  return publishCatalogFiles(env, files, source);
}

function catalogUpstreamSyncEnabled(env: Env): boolean {
  const value = (env.CATALOG_UPSTREAM_SYNC_ENABLED || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function validateCatalogContent(content: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpError(400, "invalid_catalog_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_catalog_json");
  }
  const catalog = parsed as { schema_version?: unknown; entries?: unknown };
  if (catalog.schema_version !== "0.1.0") {
    throw new HttpError(400, "unsupported_catalog_schema");
  }
  if (!Array.isArray(catalog.entries)) {
    throw new HttpError(400, "invalid_catalog_entries");
  }
  for (const entry of catalog.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new HttpError(400, "invalid_catalog_entry");
    }
    const item = entry as { id?: unknown; ecosystem?: unknown; package?: unknown; versions?: unknown };
    if (typeof item.id !== "string" || item.id.trim() === "") {
      throw new HttpError(400, "invalid_catalog_entry");
    }
    if (typeof item.ecosystem !== "string" || item.ecosystem.trim() === "") {
      throw new HttpError(400, "invalid_catalog_entry");
    }
    if (typeof item.package !== "string" || item.package.trim() === "") {
      throw new HttpError(400, "invalid_catalog_entry");
    }
    if (!Array.isArray(item.versions) || item.versions.length === 0 || item.versions.some((version) => typeof version !== "string" || version.trim() === "")) {
      throw new HttpError(400, "invalid_catalog_entry");
    }
  }
  return catalog.entries.length;
}

function safeCatalogFilePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._-]+\.json$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

async function currentCatalogBundle(env: Env): Promise<{ manifest: object; files: object[] } | null> {
  const release = await env.DB.prepare(
    "SELECT release_id, source, schema_version, file_count, entry_count, bundle_sha256, published_at FROM catalog_releases WHERE active = 1 ORDER BY published_at DESC LIMIT 1"
  ).first<CatalogReleaseRow>();
  if (!release) {
    return null;
  }
  const files = await allRows<CatalogFileRow>(
    env.DB.prepare("SELECT release_id, path, sha256, entry_count, content_json FROM catalog_files WHERE release_id = ? ORDER BY path ASC").bind(release.release_id)
  );
  return {
    manifest: {
      release_id: release.release_id,
      source: release.source,
      schema_version: release.schema_version,
      file_count: release.file_count,
      entry_count: release.entry_count,
      bundle_sha256: release.bundle_sha256,
      published_at: release.published_at,
      files: files.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        entry_count: file.entry_count
      }))
    },
    files: files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      content: file.content_json
    }))
  };
}

async function normalizeQueuedBatch(env: Env, message: NormalizeQueueMessage): Promise<NormalizationResult> {
  const batchID = sanitizeOpaqueID(message.batch_id || "");
  if (!batchID) {
    throw new HttpError(400, "invalid_normalization_message");
  }
  const batch = await env.DB.prepare(
    "SELECT batch_id, device_id, run_id, received_at, content_encoding, object_key, summary_status FROM batches WHERE batch_id = ?"
  ).bind(batchID).first<NormalizationBatchRow>();
  if (!batch) {
    throw new HttpError(404, "normalization_batch_not_found");
  }
  if (message.device_id && sanitizeDeviceID(message.device_id) !== batch.device_id) {
    throw new HttpError(400, "normalization_device_mismatch");
  }
  if (message.run_id && message.run_id !== batch.run_id) {
    throw new HttpError(400, "normalization_run_mismatch");
  }

  const startedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO normalization_jobs (batch_id, device_id, run_id, status, records_seen, packages_seen, findings_seen, promoted_current, error, started_at, completed_at) VALUES (?, ?, ?, 'processing', 0, 0, 0, 0, NULL, ?, NULL)"
  ).bind(batch.batch_id, batch.device_id, batch.run_id, startedAt).run();

  try {
    const object = await env.RAW_BATCHES.get(batch.object_key);
    if (!object) {
      throw new HttpError(404, "raw_batch_not_found");
    }
    const rawBody = new Uint8Array(await object.arrayBuffer());
    const encoding = (batch.content_encoding || "").toLowerCase();
    const ndjson = encoding === "gzip"
      ? await gunzipToText(rawBody)
      : new TextDecoder().decode(rawBody);
    if (encoding && encoding !== "gzip") {
      throw new HttpError(415, "unsupported_content_encoding");
    }

    const records = parseNDJSON(ndjson);
    const { runID, summary } = validateRecords(records, batch.device_id);
    if (runID !== batch.run_id) {
      throw new HttpError(400, "normalization_run_mismatch");
    }

    const packageRecords = records.filter((record) => record.record_type === "package");
    const findingRecords = records.filter((record) => record.record_type === "finding");
    await storeNormalizedRecords(env, batch, packageRecords, findingRecords);

    const promotableSummary = summary && summary.status === "complete" ? summary : await completeRunSummary(env, batch);
    const promotedCurrent = !!promotableSummary && await promoteCurrentIfEligible(env, batch, promotableSummary);
    const completedAt = new Date().toISOString();
    await env.DB.prepare(
      "INSERT OR REPLACE INTO normalization_jobs (batch_id, device_id, run_id, status, records_seen, packages_seen, findings_seen, promoted_current, error, started_at, completed_at) VALUES (?, ?, ?, 'complete', ?, ?, ?, ?, NULL, ?, ?)"
    ).bind(
      batch.batch_id,
      batch.device_id,
      batch.run_id,
      records.length,
      packageRecords.length,
      findingRecords.length,
      promotedCurrent ? 1 : 0,
      startedAt,
      completedAt
    ).run();
    return {
      recordsSeen: records.length,
      packagesSeen: packageRecords.length,
      findingsSeen: findingRecords.length,
      promotedCurrent
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const messageText = error instanceof Error ? error.message : "normalization_error";
    await env.DB.prepare(
      "INSERT OR REPLACE INTO normalization_jobs (batch_id, device_id, run_id, status, records_seen, packages_seen, findings_seen, promoted_current, error, started_at, completed_at) VALUES (?, ?, ?, 'error', 0, 0, 0, 0, ?, ?, ?)"
    ).bind(batch.batch_id, batch.device_id, batch.run_id, messageText, startedAt, completedAt).run();
    throw error;
  }
}

async function storeNormalizedRecords(env: Env, batch: NormalizationBatchRow, packageRecords: InventoryRecord[], findingRecords: InventoryRecord[]): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const record of [...packageRecords, ...findingRecords]) {
    const normalized = normalizedRecordValues(batch, record);
    statements.push(env.DB.prepare(
      `INSERT OR REPLACE INTO inventory_records (
        device_id, run_id, record_id, record_type, profile, schema_version, scanner_version, scan_time,
        ecosystem, package_name, normalized_name, version, root_kind, install_scope, package_manager,
        source_type, direct_dependency, has_lifecycle_scripts, confidence, requested_spec, server_name,
        finding_type, severity, catalog_id, catalog_name, evidence, batch_id, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...normalized));
    if (record.record_type === "finding") {
      statements.push(env.DB.prepare(
        `INSERT OR REPLACE INTO exposure_findings (
          device_id, run_id, record_id, profile, finding_type, severity, catalog_id, catalog_name,
          ecosystem, package_name, normalized_name, version, root_kind, source_type, confidence,
          evidence, batch_id, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        batch.device_id,
        batch.run_id,
        requiredText(record.record_id),
        textField(record.profile),
        requiredText(record.finding_type),
        textOrNull(record.severity),
        requiredText(record.catalog_id),
        textOrNull(record.catalog_name),
        requiredText(record.ecosystem),
        requiredText(record.package_name),
        requiredText(record.normalized_name),
        textOrNull(record.version),
        textOrNull(record.root_kind),
        textOrNull(record.source_type),
        textOrNull(record.confidence),
        textOrNull(record.evidence),
        batch.batch_id,
        batch.received_at
      ));
    }
  }
  await runStatements(env, statements);
}

function normalizedRecordValues(batch: NormalizationBatchRow, record: InventoryRecord): unknown[] {
  return [
    batch.device_id,
    batch.run_id,
    requiredText(record.record_id),
    requiredText(record.record_type),
    textField(record.profile),
    textOrNull(record.schema_version),
    textOrNull(record.scanner_version),
    textOrNull(record.scan_time),
    requiredText(record.ecosystem),
    requiredText(record.package_name),
    requiredText(record.normalized_name),
    textOrNull(record.version),
    textOrNull(record.root_kind),
    textOrNull(record.install_scope),
    textOrNull(record.package_manager),
    textOrNull(record.source_type),
    boolOrNull(record.direct_dependency),
    record.has_lifecycle_scripts ? 1 : 0,
    textOrNull(record.confidence),
    textOrNull(record.requested_spec),
    textOrNull(record.server_name),
    textOrNull(record.finding_type),
    textOrNull(record.severity),
    textOrNull(record.catalog_id),
    textOrNull(record.catalog_name),
    textOrNull(record.evidence),
    batch.batch_id,
    batch.received_at
  ];
}

async function completeRunSummary(env: Env, batch: NormalizationBatchRow): Promise<InventoryRecord | null> {
  const run = await env.DB.prepare(
    "SELECT profile, status, scanner_version, received_at FROM runs WHERE device_id = ? AND run_id = ? AND status = 'complete' ORDER BY received_at DESC LIMIT 1"
  ).bind(batch.device_id, batch.run_id).first<NormalizationRunRow>();
  if (!run) {
    return null;
  }
  return {
    record_type: "scan_summary",
    run_id: batch.run_id,
    profile: run.profile,
    status: run.status,
    scanner_version: run.scanner_version || undefined,
    scan_time: run.received_at
  };
}

async function promoteCurrentIfEligible(env: Env, batch: NormalizationBatchRow, summary: InventoryRecord): Promise<boolean> {
  const profile = textField(summary.profile);
  if (summary.status !== "complete" || !["baseline", "project"].includes(profile)) {
    return false;
  }
  await env.DB.prepare("DELETE FROM inventory_current WHERE device_id = ? AND profile = ?").bind(batch.device_id, profile).run();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO inventory_current (
      device_id, profile, record_id, run_id, schema_version, scanner_version, scan_time,
      ecosystem, package_name, normalized_name, version, root_kind, install_scope, package_manager,
      source_type, direct_dependency, has_lifecycle_scripts, confidence, requested_spec, server_name, observed_at
    )
    SELECT
      device_id, profile, record_id, run_id, schema_version, scanner_version, scan_time,
      ecosystem, package_name, normalized_name, version, root_kind, install_scope, package_manager,
      source_type, direct_dependency, has_lifecycle_scripts, confidence, requested_spec, server_name, received_at
    FROM inventory_records
    WHERE device_id = ? AND run_id = ? AND profile = ? AND record_type = 'package'`
  ).bind(batch.device_id, batch.run_id, profile).run();
  return true;
}

async function disableDevice(request: Request, env: Env, rawDeviceID: string): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);
  const body = await readOptionalJson<{ reason?: string }>(request);
  return adminJson(await changeDeviceLifecycle(env, rawDeviceID, "disable", {
    type: "script",
    id: "script_admin"
  }, lifecycleReason(body.reason, false)));
}

async function enableDevice(request: Request, env: Env, rawDeviceID: string): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);
  const body = await readOptionalJson<{ reason?: string }>(request);
  return adminJson(await changeDeviceLifecycle(env, rawDeviceID, "enable", {
    type: "script",
    id: "script_admin"
  }, lifecycleReason(body.reason, false)));
}

async function uiDeviceLifecycle(request: Request, env: Env, rawDeviceID: string, action: LifecycleAction): Promise<Response> {
  const actor = await requireUIAdminActionRequest(request, env);
  const body = await readOptionalJson<{ reason?: string }>(request);
  return adminJson(await changeDeviceLifecycle(env, rawDeviceID, action, actor, lifecycleReason(body.reason, true)));
}

async function changeDeviceLifecycle(env: Env, rawDeviceID: string, action: LifecycleAction, actor: LifecycleActor, reason: string): Promise<object> {
  const deviceID = sanitizeDeviceID(decodeURIComponent(rawDeviceID));
  if (!deviceID) {
    throw new HttpError(400, "invalid_device_id");
  }

  const current = await env.DB.prepare("SELECT disabled_at FROM devices WHERE device_id = ?").bind(deviceID).first<{ disabled_at: string | null }>();
  if (!current) {
    throw new HttpError(404, "device_not_found");
  }
  if (action === "disable" && current.disabled_at) {
    throw new HttpError(409, "device_already_disabled");
  }
  if (action === "enable" && !current.disabled_at) {
    throw new HttpError(409, "device_already_active");
  }

  const changedAt = new Date().toISOString();
  const newDisabledAt = action === "disable" ? changedAt : null;
  const updateSQL = action === "disable"
    ? "UPDATE devices SET disabled_at = ? WHERE device_id = ? AND disabled_at IS NULL"
    : "UPDATE devices SET disabled_at = NULL WHERE device_id = ? AND disabled_at IS NOT NULL";
  const updateValues = action === "disable" ? [newDisabledAt, deviceID] : [deviceID];
  const eventID = crypto.randomUUID();
  const updateStmt = env.DB.prepare(updateSQL).bind(...updateValues);
  const eventStmt = env.DB.prepare(
    "INSERT INTO device_lifecycle_events (event_id, device_id, action, actor_type, actor_id, reason, previous_disabled_at, new_disabled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(eventID, deviceID, action, actor.type, actor.id, reason, current.disabled_at, newDisabledAt, changedAt);
  const results = typeof env.DB.batch === "function"
    ? await env.DB.batch([updateStmt, eventStmt])
    : [await updateStmt.run(), await eventStmt.run()];
  const changes = typeof results[0]?.meta?.changes === "number" ? results[0].meta.changes : 0;
  if (changes === 0) {
    throw new HttpError(409, action === "disable" ? "device_already_disabled" : "device_already_active");
  }

  return {
    ok: true,
    device: {
      device_id: deviceID,
      status: newDisabledAt ? "disabled" : "active",
      disabled_at: newDisabledAt
    },
    event: {
      event_id: eventID,
      action,
      actor_type: actor.type,
      actor_id: actor.id,
      reason,
      previous_disabled_at: current.disabled_at,
      new_disabled_at: newDisabledAt,
      created_at: changedAt
    }
  };
}

async function purgeDevice(request: Request, env: Env, rawDeviceID: string, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry_run") || "true").toLowerCase());
  const body = await readOptionalJson<{ reason?: string; confirm_device_id?: string }>(request);
  return adminJson(await purgeDeviceData(env, rawDeviceID, {
    dryRun,
    reason: body.reason,
    confirmDeviceID: body.confirm_device_id
  }));
}

async function purgeDeviceData(
  env: Env,
  rawDeviceID: string,
  options: { dryRun: boolean; reason?: string; confirmDeviceID?: string }
): Promise<object> {
  const deviceID = sanitizeDeviceID(decodeURIComponent(rawDeviceID));
  if (!deviceID) {
    throw new HttpError(400, "invalid_device_id");
  }
  const device = await env.DB.prepare("SELECT device_id, environment, disabled_at FROM devices WHERE device_id = ?")
    .bind(deviceID)
    .first<DevicePurgeTargetRow>();
  if (!device) {
    throw new HttpError(404, "device_not_found");
  }
  const counts = await devicePurgeCounts(env, deviceID);
  if (options.dryRun) {
    return {
      ok: true,
      dry_run: true,
      device: purgeDeviceSummary(device),
      candidates: counts
    };
  }

  const reason = lifecycleReason(options.reason, true);
  if (sanitizeDeviceID(options.confirmDeviceID || "") !== deviceID) {
    throw new HttpError(400, "confirm_device_id_mismatch");
  }
  if (device.environment === "production" && !device.disabled_at) {
    throw new HttpError(409, "production_device_must_be_disabled");
  }

  const batchRows = await allRows<DevicePurgeBatchRow>(
    env.DB.prepare("SELECT batch_id, object_key FROM batches WHERE device_id = ? ORDER BY received_at ASC").bind(deviceID)
  );
  let rawObjectsDeleted = 0;
  let rawObjectDeleteErrors = 0;
  for (const batch of batchRows) {
    try {
      await env.RAW_BATCHES.delete(batch.object_key);
      rawObjectsDeleted++;
    } catch {
      rawObjectDeleteErrors++;
    }
  }
  if (rawObjectDeleteErrors > 0) {
    return {
      ok: false,
      dry_run: false,
      error: "raw_object_delete_failed",
      device: purgeDeviceSummary(device),
      raw_objects: {
        candidates: batchRows.length,
        deleted: rawObjectsDeleted,
        delete_errors: rawObjectDeleteErrors
      }
    };
  }

  const deleted = await deleteDeviceData(env, deviceID);
  return {
    ok: true,
    dry_run: false,
    device: purgeDeviceSummary(device),
    reason,
    raw_objects: {
      candidates: batchRows.length,
      deleted: rawObjectsDeleted,
      delete_errors: rawObjectDeleteErrors
    },
    deleted
  };
}

function purgeDeviceSummary(device: DevicePurgeTargetRow): object {
  return {
    device_id: device.device_id,
    environment: device.environment || "production",
    status: device.disabled_at ? "disabled" : "active",
    disabled_at: device.disabled_at || null
  };
}

async function devicePurgeCounts(env: Env, deviceID: string): Promise<DevicePurgeCounts> {
  const [
    batches,
    runs,
    normalizationJobs,
    inventoryRecords,
    inventoryCurrent,
    exposureFindings,
    lifecycleEvents
  ] = await Promise.all([
    countByDevice(env, "batches", deviceID),
    countByDevice(env, "runs", deviceID),
    countByDevice(env, "normalization_jobs", deviceID),
    countByDevice(env, "inventory_records", deviceID),
    countByDevice(env, "inventory_current", deviceID),
    countByDevice(env, "exposure_findings", deviceID),
    countByDevice(env, "device_lifecycle_events", deviceID)
  ]);
  return {
    raw_objects: batches,
    batches,
    runs,
    normalization_jobs: normalizationJobs,
    inventory_records: inventoryRecords,
    inventory_current: inventoryCurrent,
    exposure_findings: exposureFindings,
    lifecycle_events: lifecycleEvents,
    devices: 1
  };
}

async function countByDevice(env: Env, table: string, deviceID: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE device_id = ?`).bind(deviceID).first<CountRow>();
  return row?.total || 0;
}

async function deleteDeviceData(env: Env, deviceID: string): Promise<DevicePurgeCounts> {
  const deleted: DevicePurgeCounts = {
    raw_objects: 0,
    batches: 0,
    runs: 0,
    normalization_jobs: 0,
    inventory_records: 0,
    inventory_current: 0,
    exposure_findings: 0,
    lifecycle_events: 0,
    devices: 0
  };
  for (const [key, table] of [
    ["inventory_current", "inventory_current"],
    ["exposure_findings", "exposure_findings"],
    ["inventory_records", "inventory_records"],
    ["normalization_jobs", "normalization_jobs"],
    ["batches", "batches"],
    ["runs", "runs"],
    ["lifecycle_events", "device_lifecycle_events"],
    ["devices", "devices"]
  ] as const) {
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE device_id = ?`).bind(deviceID).run();
    deleted[key] = typeof result.meta?.changes === "number" ? result.meta.changes : 0;
  }
  return deleted;
}

async function runRetentionAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry_run") || "").toLowerCase());
  return adminJson(await runRetention(env, { dryRun }));
}

async function runRetention(env: Env, options: { dryRun: boolean }): Promise<object> {
  const days = nonNegativeInt(env.RETENTION_DAYS, defaultRetentionDays);
  const limit = positiveInt(env.RETENTION_DELETE_LIMIT, defaultRetentionDeleteLimit);
  if (days === 0) {
    return {
      ok: true,
      enabled: false,
      dry_run: options.dryRun,
      retention_days: days,
      limit
    };
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const oldBatches = await allRows<RetentionBatchRow>(
    env.DB.prepare(
      "SELECT batch_id, object_key FROM batches WHERE received_at < ? ORDER BY received_at ASC LIMIT ?"
    ).bind(cutoff, limit)
  );

  const deletedBatchIDs: string[] = [];
  let rawObjectsDeleted = 0;
  let rawObjectDeleteErrors = 0;
  if (!options.dryRun) {
    for (const batch of oldBatches) {
      try {
        await env.RAW_BATCHES.delete(batch.object_key);
        rawObjectsDeleted++;
        deletedBatchIDs.push(batch.batch_id);
      } catch {
        rawObjectDeleteErrors++;
      }
    }
    await deleteBatchesByID(env, deletedBatchIDs);
  }

  const runLimit = options.dryRun ? limit : Math.max(1, limit - deletedBatchIDs.length);
  const orphanedRuns = await allRows<RetentionRunRow>(
    env.DB.prepare(
      `SELECT r.device_id, r.profile, r.run_id
       FROM runs r
       WHERE r.received_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM batches b
           WHERE b.device_id = r.device_id AND b.run_id = r.run_id
         )
       ORDER BY r.received_at ASC
       LIMIT ?`
    ).bind(cutoff, runLimit)
  );

  let runsDeleted = 0;
  if (!options.dryRun) {
    runsDeleted = await deleteRunsByID(env, orphanedRuns);
  }

  return {
    ok: true,
    enabled: true,
    dry_run: options.dryRun,
    retention_days: days,
    cutoff_received_before: cutoff,
    limit,
    batches: {
      candidates: oldBatches.length,
      deleted: options.dryRun ? 0 : deletedBatchIDs.length
    },
    raw_objects: {
      deleted: options.dryRun ? 0 : rawObjectsDeleted,
      delete_errors: options.dryRun ? 0 : rawObjectDeleteErrors
    },
    runs: {
      candidates: orphanedRuns.length,
      deleted: options.dryRun ? 0 : runsDeleted
    }
  };
}

async function deleteBatchesByID(env: Env, batchIDs: string[]): Promise<void> {
  if (batchIDs.length === 0) {
    return;
  }
  const placeholders = batchIDs.map(() => "?").join(", ");
  await env.DB.prepare(`DELETE FROM batches WHERE batch_id IN (${placeholders})`).bind(...batchIDs).run();
}

async function deleteRunsByID(env: Env, runs: RetentionRunRow[]): Promise<number> {
  if (runs.length === 0) {
    return 0;
  }
  const clauses = runs.map(() => "(device_id = ? AND profile = ? AND run_id = ?)").join(" OR ");
  const values = runs.flatMap((run) => [run.device_id, run.profile, run.run_id]);
  const result = await env.DB.prepare(`DELETE FROM runs WHERE ${clauses}`).bind(...values).run();
  return typeof result.meta?.changes === "number" ? result.meta.changes : runs.length;
}

async function adminOverview(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminOverviewData(env, url));
}

async function uiAdminOverview(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminOverviewData(env, url));
}

async function adminAttention(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminAttentionData(env, url));
}

async function uiAdminAttention(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminAttentionData(env, url));
}

async function uiAdminHealth(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminHealthData(env, url));
}

async function adminOverviewData(env: Env, url: URL): Promise<object> {
  const environment = environmentFilter(url);
  const deviceWhere = environment === "all" ? "" : "WHERE environment = ?";
  const deviceValues: string[] = environment === "all" ? [] : [environment];
  const relationWhere = environment === "all"
    ? ""
    : "WHERE EXISTS (SELECT 1 FROM devices d WHERE d.device_id = DEVICE_COLUMN AND d.environment = ?)";
  const relationValues: string[] = environment === "all" ? [] : [environment];
  const devices = await env.DB.prepare(
    `SELECT COUNT(*) AS total_devices, SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active_devices, SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled_devices FROM devices ${deviceWhere}`
  ).bind(...deviceValues).first<AdminOverviewRow>();
  const runs = await env.DB.prepare(
    `SELECT COUNT(*) AS total_runs, SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete_runs, MAX(received_at) AS latest_run_received_at FROM runs r ${relationWhere.replace("DEVICE_COLUMN", "r.device_id")}`
  ).bind(...relationValues).first<AdminRunOverviewRow>();
  const batches = await env.DB.prepare(
    `SELECT COUNT(*) AS total_batches, SUM(record_count) AS total_records FROM batches b ${relationWhere.replace("DEVICE_COLUMN", "b.device_id")}`
  ).bind(...relationValues).first<AdminBatchTotalRow>();

  return {
    devices: {
      total: devices?.total_devices || 0,
      active: devices?.active_devices || 0,
      disabled: devices?.disabled_devices || 0
    },
    runs: {
      total: runs?.total_runs || 0,
      complete: runs?.complete_runs || 0,
      latest_received_at: runs?.latest_run_received_at || null
    },
    batches: {
      total: batches?.total_batches || 0,
      records: batches?.total_records || 0
    },
    environment
  };
}

async function adminHealthData(env: Env, url?: URL): Promise<object> {
  const config = healthConfig(env);
  const environment = url ? environmentFilter(url) : "production";
  const where = ["d.disabled_at IS NULL"];
  const values = [
    config.profile,
    config.profile,
    config.profile,
    config.profile,
    config.profile,
    config.profile
  ];
  if (environment !== "all") {
    where.push("d.environment = ?");
    values.push(environment);
  }
  const rows = await allRows<AdminHealthRow>(
    env.DB.prepare(`SELECT
      d.device_id,
      d.environment,
      d.created_at,
      (SELECT run_id FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? ORDER BY received_at DESC LIMIT 1) AS last_run_id,
      (SELECT status FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? ORDER BY received_at DESC LIMIT 1) AS last_run_status,
      (SELECT scanner_version FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? ORDER BY received_at DESC LIMIT 1) AS last_run_scanner_version,
      (SELECT received_at FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? ORDER BY received_at DESC LIMIT 1) AS last_run_received_at,
      (SELECT run_id FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? AND r.status = 'complete' ORDER BY received_at DESC LIMIT 1) AS last_complete_run_id,
      (SELECT received_at FROM runs r WHERE r.device_id = d.device_id AND r.profile = ? AND r.status = 'complete' ORDER BY received_at DESC LIMIT 1) AS last_complete_received_at
    FROM devices d
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(last_run_received_at, d.created_at) DESC`).bind(...values)
  );
  const now = new Date();
  const devices = rows.map((row) => formatHealthRow(row, config, now));
  const counts = { healthy: 0, stale: 0, attention: 0, unknown: 0, total: devices.length };
  for (const device of devices) {
    counts[device.health]++;
  }
  return {
    config: {
      profile: config.profile,
      expected_cadence_hours: config.expectedCadenceHours,
      stale_hours: config.staleHours,
      weekend_grace_hours: config.weekendGraceHours
    },
    counts,
    devices,
    environment
  };
}

async function adminAttentionData(env: Env, url: URL): Promise<object> {
  const severity = url.searchParams.get("severity") || "all";
  if (!["all", "critical", "warning"].includes(severity)) {
    throw new HttpError(400, "invalid_attention_severity");
  }
  const reason = url.searchParams.get("reason") || "";
  if (reason && !isAttentionReason(reason)) {
    throw new HttpError(400, "invalid_attention_reason");
  }

  const limit = boundedIntParam(url.searchParams, "limit", 10, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const config = attentionConfig(env);
  const environment = environmentFilter(url);
  const health = await adminHealthData(env, url) as {
    devices: HealthDevice[];
  };
  const attention: AttentionItem[] = [];
  const now = new Date();

  for (const device of health.devices) {
    if (isAttentionReason(device.reason)) {
      attention.push(attentionItem(device, device.reason, null, config, now));
    }

    const completeRunID = device.last_completed_run_id;
    if (!completeRunID) {
      continue;
    }

    const job = await env.DB.prepare(`${adminNormalizationJobSelect()} WHERE device_id = ? AND run_id = ? ORDER BY started_at DESC LIMIT 1`)
      .bind(device.device_id, completeRunID)
      .first<AdminNormalizationJobRow>();
    const normalizationReason = normalizationAttentionReason(job, config, now);
    if (normalizationReason) {
      attention.push(attentionItem(device, normalizationReason, job || null, config, now));
    }
  }

  const filtered = attention.filter((item) =>
    (severity === "all" || item.severity === severity) &&
    (!reason || item.reason === reason)
  );
  filtered.sort((left, right) => {
    const severityOrder = severityRank(left.severity) - severityRank(right.severity);
    if (severityOrder !== 0) return severityOrder;
    return (right.observed_at || "").localeCompare(left.observed_at || "");
  });

  return {
    config: {
      profile: config.profile,
      expected_cadence_hours: config.expectedCadenceHours,
      stale_hours: config.staleHours,
      weekend_grace_hours: config.weekendGraceHours,
      normalization_processing_stale_minutes: config.normalizationProcessingStaleMinutes
    },
    counts: attentionCounts(attention),
    attention: filtered.slice(offset, offset + limit),
    ...paginationMeta(filtered.length, limit, offset),
    filters: {
      severity,
      reason: reason || null,
      environment
    }
  };
}

async function adminDevices(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminDevicesData(env, url));
}

async function uiAdminDevices(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminDevicesData(env, url));
}

async function adminDevicesData(env: Env, url: URL): Promise<object> {
  const status = url.searchParams.get("status") || "active";
  if (!["active", "disabled", "all"].includes(status)) {
    throw new HttpError(400, "invalid_status_filter");
  }
  const environment = environmentFilter(url);
  const limit = boundedIntParam(url.searchParams, "limit", 50, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const whereParts: string[] = [];
  const values: (string | number)[] = [];
  if (status === "active") {
    whereParts.push("d.disabled_at IS NULL");
  } else if (status === "disabled") {
    whereParts.push("d.disabled_at IS NOT NULL");
  }
  if (environment !== "all") {
    whereParts.push("d.environment = ?");
    values.push(environment);
  }
  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM devices d ${where}`).bind(...values).first<CountRow>();
  const rows = await allRows<AdminDeviceRow>(
    env.DB.prepare(`${adminDeviceSelect()} ${where} ORDER BY COALESCE(last_run_received_at, d.created_at) DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset)
  );

  return {
    devices: rows.map(formatAdminDeviceRow),
    ...paginationMeta(count?.total || 0, limit, offset),
    status,
    environment
  };
}

async function adminDeviceDetail(request: Request, env: Env, rawDeviceID: string): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminDeviceDetailData(env, rawDeviceID));
}

async function uiAdminDeviceDetail(request: Request, env: Env, rawDeviceID: string): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminDeviceDetailData(env, rawDeviceID));
}

async function adminDeviceDetailData(env: Env, rawDeviceID: string): Promise<object> {
  const deviceID = sanitizeDeviceID(decodeURIComponent(rawDeviceID));
  if (!deviceID) {
    throw new HttpError(400, "invalid_device_id");
  }
  const device = await env.DB.prepare(`${adminDeviceSelect()} WHERE d.device_id = ?`).bind(deviceID).first<AdminDeviceRow>();
  if (!device) {
    throw new HttpError(404, "device_not_found");
  }
  const runs = await allRows<AdminRunRow>(
    env.DB.prepare(`${adminRunSelect()} WHERE r.device_id = ? ORDER BY r.received_at DESC LIMIT 10`).bind(deviceID)
  );
  const lifecycleEvents = await allRows<AdminLifecycleEventRow>(
    env.DB.prepare(
      "SELECT event_id, device_id, action, actor_type, actor_id, reason, previous_disabled_at, new_disabled_at, created_at FROM device_lifecycle_events WHERE device_id = ? ORDER BY created_at DESC LIMIT 10"
    ).bind(deviceID)
  );
  const normalizationJobs = await allRows<AdminNormalizationJobRow>(
    env.DB.prepare(`${adminNormalizationJobSelect()} WHERE device_id = ? ORDER BY started_at DESC LIMIT 10`).bind(deviceID)
  );

  return {
    device: formatAdminDeviceRow(device),
    recent_runs: rowsWithCounts(runs),
    recent_normalization_jobs: normalizationJobs.map(formatNormalizationJobRow),
    lifecycle_events: lifecycleEvents.map(formatLifecycleEventRow)
  };
}

async function adminRuns(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminRunsData(env, url));
}

async function uiAdminRuns(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminRunsData(env, url));
}

async function adminRunsData(env: Env, url: URL): Promise<object> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const environment = environmentFilter(url);
  addEnvironmentFilter(where, values, environment, "r.device_id");
  const deviceID = url.searchParams.get("device_id");
  if (deviceID) {
    const sanitized = sanitizeDeviceID(deviceID);
    if (!sanitized) {
      throw new HttpError(400, "invalid_device_id");
    }
    where.push("r.device_id = ?");
    values.push(sanitized);
  }
  for (const [param, column] of [["status", "r.status"], ["profile", "r.profile"]] as const) {
    const value = url.searchParams.get(param);
    if (value) {
      where.push(`${column} = ?`);
      values.push(value);
    }
  }
  const limit = boundedIntParam(url.searchParams, "limit", 50, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM runs r ${whereSQL}`).bind(...values).first<CountRow>();
  values.push(limit, offset);
  const rows = await allRows<AdminRunRow>(
    env.DB.prepare(`${adminRunSelect()} ${whereSQL} ORDER BY r.received_at DESC LIMIT ? OFFSET ?`).bind(...values)
  );

  return {
    runs: rowsWithCounts(rows),
    ...paginationMeta(count?.total || 0, limit, offset),
    environment
  };
}

async function adminNormalizationJobs(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminNormalizationJobsData(env, url));
}

async function uiAdminNormalizationJobs(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminNormalizationJobsData(env, url));
}

async function adminFindings(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminFindingsData(env, url));
}

async function uiAdminFindings(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminFindingsData(env, url));
}

async function adminNormalizationJobsData(env: Env, url: URL): Promise<object> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const environment = environmentFilter(url);
  addEnvironmentFilter(where, values, environment, "normalization_jobs.device_id");
  const deviceID = url.searchParams.get("device_id");
  if (deviceID) {
    const sanitized = sanitizeDeviceID(deviceID);
    if (!sanitized) {
      throw new HttpError(400, "invalid_device_id");
    }
    where.push("device_id = ?");
    values.push(sanitized);
  }
  const runID = textField(url.searchParams.get("run_id") || "");
  if (runID) {
    where.push("run_id = ?");
    values.push(runID);
  }
  const status = url.searchParams.get("status") || "";
  if (status) {
    if (!["processing", "complete", "error"].includes(status)) {
      throw new HttpError(400, "invalid_normalization_status");
    }
    where.push("status = ?");
    values.push(status);
  }
  const promotedCurrent = url.searchParams.get("promoted_current") || "";
  if (promotedCurrent) {
    if (!["true", "false"].includes(promotedCurrent)) {
      throw new HttpError(400, "invalid_promoted_current");
    }
    where.push("promoted_current = ?");
    values.push(promotedCurrent === "true" ? 1 : 0);
  }
  const limit = boundedIntParam(url.searchParams, "limit", 50, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM normalization_jobs ${whereSQL}`).bind(...values).first<CountRow>();
  const rows = await allRows<AdminNormalizationJobRow>(
    env.DB.prepare(`${adminNormalizationJobSelect()} ${whereSQL} ORDER BY started_at DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset)
  );

  return {
    normalization_jobs: rows.map(formatNormalizationJobRow),
    ...paginationMeta(count?.total || 0, limit, offset),
    filters: {
      status: status || null,
      device_id: deviceID ? sanitizeDeviceID(deviceID) : null,
      run_id: runID || null,
      promoted_current: promotedCurrent || null,
      environment
    }
  };
}

async function adminFindingsData(env: Env, url: URL): Promise<object> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const environment = environmentFilter(url);
  addEnvironmentFilter(where, values, environment, "exposure_findings.device_id");
  const deviceID = url.searchParams.get("device_id");
  if (deviceID) {
    const sanitized = sanitizeDeviceID(deviceID);
    if (!sanitized) {
      throw new HttpError(400, "invalid_device_id");
    }
    where.push("device_id = ?");
    values.push(sanitized);
  }
  for (const param of ["severity", "catalog_id", "ecosystem", "profile", "run_id"] as const) {
    const value = textField(url.searchParams.get(param) || "");
    if (!value) {
      continue;
    }
    if (!isSafeFilterToken(value)) {
      throw new HttpError(400, `invalid_${param}`);
    }
    where.push(`${param} = ?`);
    values.push(value);
  }
  const query = (url.searchParams.get("query") || "").trim();
  if (query) {
    where.push("(normalized_name LIKE ? ESCAPE '\\' OR package_name LIKE ? ESCAPE '\\')");
    const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
    values.push(like, like);
  }
  const limit = boundedIntParam(url.searchParams, "limit", 10, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM exposure_findings ${whereSQL}`).bind(...values).first<CountRow>();
  const severityRows = await allRows<CountByValueRow>(
    env.DB.prepare(`SELECT COALESCE(severity, '') AS value, COUNT(*) AS total FROM exposure_findings ${whereSQL} GROUP BY COALESCE(severity, '')`).bind(...values)
  );
  const rows = await allRows<AdminFindingRow>(
    env.DB.prepare(`${adminFindingSelect()} ${whereSQL} ORDER BY received_at DESC, device_id ASC, catalog_id ASC, normalized_name ASC LIMIT ? OFFSET ?`).bind(...values, limit, offset)
  );

  return {
    counts: {
      total: count?.total || 0,
      severities: Object.fromEntries(severityRows.map((row) => [row.value || "unspecified", row.total || 0]))
    },
    findings: rows.map(formatFindingRow),
    ...paginationMeta(count?.total || 0, limit, offset),
    filters: {
      severity: textField(url.searchParams.get("severity") || "") || null,
      catalog_id: textField(url.searchParams.get("catalog_id") || "") || null,
      ecosystem: textField(url.searchParams.get("ecosystem") || "") || null,
      query: query || null,
      device_id: deviceID ? sanitizeDeviceID(deviceID) : null,
      profile: textField(url.searchParams.get("profile") || "") || null,
      run_id: textField(url.searchParams.get("run_id") || "") || null,
      environment
    }
  };
}

async function adminPackages(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminPackagesData(env, url, null));
}

async function uiAdminPackages(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminPackagesData(env, url, null));
}

async function adminDevicePackages(request: Request, env: Env, rawDeviceID: string, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminPackagesData(env, url, rawDeviceID));
}

async function uiAdminDevicePackages(request: Request, env: Env, rawDeviceID: string, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminPackagesData(env, url, rawDeviceID));
}

async function adminPackageDetail(request: Request, env: Env, url: URL): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminPackageDetailData(env, url));
}

async function uiAdminPackageDetail(request: Request, env: Env, url: URL): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminPackageDetailData(env, url));
}

async function adminPackagesData(env: Env, url: URL, rawDeviceID: string | null): Promise<object> {
  const requestedView = url.searchParams.get("view") || "summary";
  if (!isPackageView(requestedView)) {
    throw new HttpError(400, "invalid_package_view");
  }
  const view = requestedView;
  const where: string[] = [];
  const values: (string | number)[] = [];
  const environment = environmentFilter(url);
  addEnvironmentFilter(where, values, environment, "inventory_current.device_id");
  const deviceParam = rawDeviceID ? decodeURIComponent(rawDeviceID) : url.searchParams.get("device_id");
  if (deviceParam) {
    const deviceID = sanitizeDeviceID(deviceParam);
    if (!deviceID) {
      throw new HttpError(400, "invalid_device_id");
    }
    where.push("device_id = ?");
    values.push(deviceID);
  }
  for (const param of ["ecosystem", "profile"] as const) {
    const value = url.searchParams.get(param);
    if (value) {
      where.push(`${param} = ?`);
      values.push(value);
    }
  }
  const query = (url.searchParams.get("query") || "").trim();
  if (query) {
    where.push("(normalized_name LIKE ? OR package_name LIKE ?)");
    const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
    values.push(like, like);
  }
  const limit = boundedIntParam(url.searchParams, "limit", 50, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const pageValues = [...values, limit, offset];
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await packageCountForView(env, view, whereSQL, values);
  const packages = await packageRowsForView(env, view, whereSQL, pageValues);
  return {
    view,
    packages,
    ...paginationMeta(count, limit, offset),
    query,
    device_id: deviceParam ? sanitizeDeviceID(deviceParam) : null,
    environment
  };
}

async function adminPackageDetailData(env: Env, url: URL): Promise<object> {
  const name = textField(url.searchParams.get("name") || url.searchParams.get("package") || "");
  const ecosystem = textField(url.searchParams.get("ecosystem") || "");
  if (!name) {
    throw new HttpError(400, "missing_package_name");
  }
  if (!ecosystem) {
    throw new HttpError(400, "missing_ecosystem");
  }

  const where: string[] = [];
  const values: (string | number)[] = [];
  const environment = environmentFilter(url);
  addEnvironmentFilter(where, values, environment, "inventory_current.device_id");
  const deviceParam = url.searchParams.get("device_id");
  if (deviceParam) {
    const deviceID = sanitizeDeviceID(deviceParam);
    if (!deviceID) {
      throw new HttpError(400, "invalid_device_id");
    }
    where.push("device_id = ?");
    values.push(deviceID);
  }
  where.push("ecosystem = ?");
  values.push(ecosystem);
  const profile = textField(url.searchParams.get("profile") || "");
  if (profile) {
    where.push("profile = ?");
    values.push(profile);
  }
  where.push("normalized_name = ?");
  values.push(name);

  const observationLimit = boundedIntParam(url.searchParams, "observation_limit", 5000, 10000);
  const rows = await allRows<NormalizedPackageRow>(
    env.DB.prepare(`${adminPackageSelect()} WHERE ${where.join(" AND ")} ORDER BY observed_at DESC, device_id ASC, version ASC LIMIT ?`).bind(...values, observationLimit)
  );
  if (rows.length === 0) {
    throw new HttpError(404, "package_detail_not_found");
  }
  return formatPackageDetailRows(rows, {
    name,
    ecosystem,
    profile: profile || null,
    device_id: deviceParam ? sanitizeDeviceID(deviceParam) : null,
    environment,
    observation_limit: observationLimit
  });
}

function isPackageView(view: string): view is PackageView {
  return view === "package" || view === "summary" || view === "observations";
}

async function packageRowsForView(
  env: Env,
  view: PackageView,
  whereSQL: string,
  pageValues: (string | number)[]
): Promise<object[]> {
  if (view === "package") {
    const familyRows = await allRows<NormalizedPackageFamilyRow>(
      env.DB.prepare(`${adminPackageFamilySelect()} ${whereSQL} GROUP BY device_id, profile, ecosystem, normalized_name ORDER BY normalized_name ASC, device_id ASC LIMIT ? OFFSET ?`).bind(...pageValues)
    );
    if (familyRows.length === 0) {
      return [];
    }
    const versionRows = await allRows<NormalizedPackageSummaryRow>(
      env.DB.prepare(adminPackageFamilyVersionSelect(whereSQL)).bind(...pageValues)
    );
    return formatPackageFamilyRows(familyRows, versionRows);
  }
  if (view === "summary") {
    const rows = await allRows<NormalizedPackageSummaryRow>(
      env.DB.prepare(`${adminPackageSummarySelect()} ${whereSQL} GROUP BY device_id, profile, ecosystem, normalized_name, version ORDER BY normalized_name ASC, version ASC, device_id ASC LIMIT ? OFFSET ?`).bind(...pageValues)
    );
    return rows.map(formatPackageSummaryRow);
  }
  const rows = await allRows<NormalizedPackageRow>(
    env.DB.prepare(`${adminPackageSelect()} ${whereSQL} ORDER BY normalized_name ASC, version ASC, device_id ASC LIMIT ? OFFSET ?`).bind(...pageValues)
  );
  return rows.map(formatPackageRow);
}

async function packageCountForView(
  env: Env,
  view: PackageView,
  whereSQL: string,
  values: (string | number)[]
): Promise<number> {
  if (view === "package") {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM (
        SELECT 1 FROM inventory_current
        ${whereSQL}
        GROUP BY device_id, profile, ecosystem, normalized_name
      ) grouped_packages`
    ).bind(...values).first<CountRow>();
    return count?.total || 0;
  }
  if (view === "summary") {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM (
        SELECT 1 FROM inventory_current
        ${whereSQL}
        GROUP BY device_id, profile, ecosystem, normalized_name, version
      ) grouped_packages`
    ).bind(...values).first<CountRow>();
    return count?.total || 0;
  }
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM inventory_current ${whereSQL}`).bind(...values).first<CountRow>();
  return count?.total || 0;
}

function paginationMeta(total: number, limit: number, offset: number): object {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const pageCount = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);
  return {
    limit: safeLimit,
    offset: safeOffset,
    total: safeTotal,
    page: Math.floor(safeOffset / safeLimit) + 1,
    page_count: pageCount,
    has_more: safeOffset + safeLimit < safeTotal
  };
}

function adminDeviceSelect(): string {
  return `SELECT
    d.device_id,
    d.environment,
    d.created_at,
    d.disabled_at,
    (SELECT COUNT(*) FROM runs r WHERE r.device_id = d.device_id) AS run_count,
    (SELECT COUNT(*) FROM batches b WHERE b.device_id = d.device_id) AS batch_count,
    (SELECT SUM(record_count) FROM batches b WHERE b.device_id = d.device_id) AS record_count,
    (SELECT run_id FROM runs r WHERE r.device_id = d.device_id ORDER BY received_at DESC LIMIT 1) AS last_run_id,
    (SELECT profile FROM runs r WHERE r.device_id = d.device_id ORDER BY received_at DESC LIMIT 1) AS last_run_profile,
    (SELECT status FROM runs r WHERE r.device_id = d.device_id ORDER BY received_at DESC LIMIT 1) AS last_run_status,
    (SELECT scanner_version FROM runs r WHERE r.device_id = d.device_id ORDER BY received_at DESC LIMIT 1) AS last_run_scanner_version,
    (SELECT received_at FROM runs r WHERE r.device_id = d.device_id ORDER BY received_at DESC LIMIT 1) AS last_run_received_at
  FROM devices d`;
}

function adminRunSelect(): string {
  return `SELECT
    r.device_id,
    r.run_id,
    r.profile,
    r.status,
    r.scanner_version,
    r.received_at,
    (SELECT COUNT(*) FROM batches b WHERE b.device_id = r.device_id AND b.run_id = r.run_id) AS batch_count,
    (SELECT SUM(record_count) FROM batches b WHERE b.device_id = r.device_id AND b.run_id = r.run_id) AS record_count
  FROM runs r`;
}

function adminNormalizationJobSelect(): string {
  return `SELECT
    batch_id,
    device_id,
    run_id,
    status,
    records_seen,
    packages_seen,
    findings_seen,
    promoted_current,
    error,
    started_at,
    completed_at
  FROM normalization_jobs`;
}

function adminFindingSelect(): string {
  return `SELECT
    device_id,
    run_id,
    record_id,
    profile,
    finding_type,
    severity,
    catalog_id,
    catalog_name,
    ecosystem,
    package_name,
    normalized_name,
    version,
    root_kind,
    source_type,
    confidence,
    evidence,
    received_at
  FROM exposure_findings`;
}

function adminPackageSelect(): string {
  return `SELECT
    device_id,
    profile,
    record_id,
    run_id,
    schema_version,
    scanner_version,
    scan_time,
    ecosystem,
    package_name,
    normalized_name,
    version,
    root_kind,
    install_scope,
    package_manager,
    source_type,
    direct_dependency,
    has_lifecycle_scripts,
    confidence,
    requested_spec,
    server_name,
    observed_at
  FROM inventory_current`;
}

function adminPackageSummarySelect(): string {
  return `SELECT
    device_id,
    profile,
    ecosystem,
    MIN(package_name) AS package_name,
    normalized_name,
    version,
    COUNT(*) AS occurrence_count,
    GROUP_CONCAT(DISTINCT package_manager) AS package_managers,
    GROUP_CONCAT(DISTINCT source_type) AS source_types,
    GROUP_CONCAT(DISTINCT root_kind) AS root_kinds,
    MAX(CASE WHEN direct_dependency = 1 THEN 1 ELSE 0 END) AS direct_dependency_present,
    MAX(CASE WHEN has_lifecycle_scripts = 1 THEN 1 ELSE 0 END) AS has_lifecycle_scripts,
    MAX(observed_at) AS latest_observed_at,
    MAX(run_id) AS latest_run_id
  FROM inventory_current`;
}

function adminPackageFamilySelect(): string {
  return `SELECT
    device_id,
    profile,
    ecosystem,
    MIN(package_name) AS package_name,
    normalized_name,
    COUNT(DISTINCT COALESCE(version, '')) AS version_count,
    COUNT(*) AS total_occurrence_count,
    GROUP_CONCAT(DISTINCT package_manager) AS package_managers,
    GROUP_CONCAT(DISTINCT source_type) AS source_types,
    GROUP_CONCAT(DISTINCT root_kind) AS root_kinds,
    MAX(CASE WHEN direct_dependency = 1 THEN 1 ELSE 0 END) AS direct_dependency_present,
    MAX(CASE WHEN has_lifecycle_scripts = 1 THEN 1 ELSE 0 END) AS has_lifecycle_scripts,
    MAX(observed_at) AS latest_observed_at,
    MAX(run_id) AS latest_run_id
  FROM inventory_current`;
}

function adminPackageFamilyVersionSelect(whereSQL: string): string {
  return `WITH family_page AS (
    SELECT
      device_id,
      profile,
      ecosystem,
      normalized_name
    FROM inventory_current
    ${whereSQL}
    GROUP BY device_id, profile, ecosystem, normalized_name
    ORDER BY normalized_name ASC, device_id ASC
    LIMIT ? OFFSET ?
  )
  SELECT
    i.device_id,
    i.profile,
    i.ecosystem,
    MIN(i.package_name) AS package_name,
    i.normalized_name,
    i.version,
    COUNT(*) AS occurrence_count,
    GROUP_CONCAT(DISTINCT i.package_manager) AS package_managers,
    GROUP_CONCAT(DISTINCT i.source_type) AS source_types,
    GROUP_CONCAT(DISTINCT i.root_kind) AS root_kinds,
    MAX(CASE WHEN i.direct_dependency = 1 THEN 1 ELSE 0 END) AS direct_dependency_present,
    MAX(CASE WHEN i.has_lifecycle_scripts = 1 THEN 1 ELSE 0 END) AS has_lifecycle_scripts,
    MAX(i.observed_at) AS latest_observed_at,
    MAX(i.run_id) AS latest_run_id
  FROM inventory_current i
  INNER JOIN family_page f ON
    f.device_id = i.device_id AND
    f.profile = i.profile AND
    f.ecosystem = i.ecosystem AND
    f.normalized_name = i.normalized_name
  GROUP BY i.device_id, i.profile, i.ecosystem, i.normalized_name, i.version
  ORDER BY i.normalized_name ASC, i.version ASC, i.device_id ASC`;
}

function formatAdminDeviceRow(row: AdminDeviceRow): object {
  return {
    device_id: row.device_id,
    environment: row.environment || "production",
    created_at: row.created_at,
    disabled_at: row.disabled_at,
    status: row.disabled_at ? "disabled" : "active",
    run_count: row.run_count || 0,
    batch_count: row.batch_count || 0,
    record_count: row.record_count || 0,
    last_run: row.last_run_id ? {
      run_id: row.last_run_id,
      profile: row.last_run_profile,
      status: row.last_run_status,
      scanner_version: row.last_run_scanner_version,
      received_at: row.last_run_received_at
    } : null
  };
}

function formatPackageRow(row: NormalizedPackageRow): object {
  return {
    device_id: row.device_id,
    profile: row.profile,
    record_id: row.record_id,
    run_id: row.run_id,
    ecosystem: row.ecosystem,
    package_name: row.package_name,
    normalized_name: row.normalized_name,
    version: row.version,
    root_kind: row.root_kind,
    install_scope: row.install_scope,
    package_manager: row.package_manager,
    source_type: row.source_type,
    direct_dependency: row.direct_dependency === null || row.direct_dependency === undefined ? null : !!row.direct_dependency,
    has_lifecycle_scripts: !!row.has_lifecycle_scripts,
    confidence: row.confidence,
    requested_spec: row.requested_spec,
    server_name: row.server_name,
    observed_at: row.observed_at,
    scanner_version: row.scanner_version
  };
}

function formatPackageSummaryRow(row: NormalizedPackageSummaryRow): object {
  return {
    device_id: row.device_id,
    profile: row.profile,
    ecosystem: row.ecosystem,
    package_name: row.package_name,
    normalized_name: row.normalized_name,
    version: row.version,
    occurrence_count: row.occurrence_count,
    package_managers: splitGroupedValues(row.package_managers),
    source_types: splitGroupedValues(row.source_types),
    root_kinds: splitGroupedValues(row.root_kinds),
    direct_dependency_present: row.direct_dependency_present === null || row.direct_dependency_present === undefined ? null : !!row.direct_dependency_present,
    has_lifecycle_scripts: !!row.has_lifecycle_scripts,
    latest_observed_at: row.latest_observed_at,
    latest_run_id: row.latest_run_id,
    observed_at: row.latest_observed_at
  };
}

function formatPackageFamilyRows(familyRows: NormalizedPackageFamilyRow[], versionRows: NormalizedPackageSummaryRow[]): object[] {
  const versionsByFamily = new Map<string, object[]>();
  for (const row of versionRows) {
    const key = packageFamilyKey(row);
    const versions = versionsByFamily.get(key) || [];
    versions.push(formatPackageVersionRow(row));
    versionsByFamily.set(key, versions);
  }
  return familyRows.map((row) => ({
    device_id: row.device_id,
    profile: row.profile,
    ecosystem: row.ecosystem,
    package_name: row.package_name,
    normalized_name: row.normalized_name,
    version_count: row.version_count,
    total_occurrence_count: row.total_occurrence_count,
    occurrence_count: row.total_occurrence_count,
    package_managers: splitGroupedValues(row.package_managers),
    source_types: splitGroupedValues(row.source_types),
    root_kinds: splitGroupedValues(row.root_kinds),
    direct_dependency_present: row.direct_dependency_present === null || row.direct_dependency_present === undefined ? null : !!row.direct_dependency_present,
    has_lifecycle_scripts: !!row.has_lifecycle_scripts,
    latest_observed_at: row.latest_observed_at,
    latest_run_id: row.latest_run_id,
    observed_at: row.latest_observed_at,
    versions: versionsByFamily.get(packageFamilyKey(row)) || []
  }));
}

function formatPackageVersionRow(row: NormalizedPackageSummaryRow): object {
  return {
    version: row.version,
    occurrence_count: row.occurrence_count,
    package_managers: splitGroupedValues(row.package_managers),
    source_types: splitGroupedValues(row.source_types),
    root_kinds: splitGroupedValues(row.root_kinds),
    direct_dependency_present: row.direct_dependency_present === null || row.direct_dependency_present === undefined ? null : !!row.direct_dependency_present,
    has_lifecycle_scripts: !!row.has_lifecycle_scripts,
    latest_observed_at: row.latest_observed_at,
    latest_run_id: row.latest_run_id,
    observed_at: row.latest_observed_at
  };
}

function formatPackageDetailRows(
  rows: NormalizedPackageRow[],
  filters: { name: string; ecosystem: string; profile: string | null; device_id: string | null; environment: EnvironmentFilterValue; observation_limit: number }
): object {
  const first = rows[0];
  const summary: PackageDetailAccumulator = {
    package_name: first.package_name,
    normalized_name: first.normalized_name,
    ecosystem: first.ecosystem,
    profiles: new Set<string>(),
    devices: new Set<string>(),
    versions: new Set<string>(),
    total_occurrence_count: 0,
    package_managers: new Set<string>(),
    source_types: new Set<string>(),
    root_kinds: new Set<string>(),
    direct_dependency_seen: false,
    direct_dependency_present: false,
    has_lifecycle_scripts: false,
    latest_observed_at: first.observed_at,
    latest_run_id: first.run_id
  };
  const versions = new Map<string, PackageDetailVersionAccumulator>();
  const devices = new Map<string, PackageDetailDeviceAccumulator>();

  for (const row of rows) {
    addPackageDetailSummary(summary, row);

    const versionKey = row.version || "";
    let version = versions.get(versionKey);
    if (!version) {
      version = {
        version: row.version,
        devices: new Set<string>(),
        occurrence_count: 0,
        package_managers: new Set<string>(),
        source_types: new Set<string>(),
        root_kinds: new Set<string>(),
        direct_dependency_seen: false,
        direct_dependency_present: false,
        has_lifecycle_scripts: false,
        latest_observed_at: row.observed_at,
        latest_run_id: row.run_id
      };
      versions.set(versionKey, version);
    }
    addPackageDetailVersion(version, row);

    const deviceKey = `${row.device_id}\u001f${row.profile}`;
    let device = devices.get(deviceKey);
    if (!device) {
      device = {
        device_id: row.device_id,
        profile: row.profile,
        versions: new Set<string>(),
        total_occurrence_count: 0,
        package_managers: new Set<string>(),
        source_types: new Set<string>(),
        root_kinds: new Set<string>(),
        direct_dependency_seen: false,
        direct_dependency_present: false,
        has_lifecycle_scripts: false,
        latest_observed_at: row.observed_at,
        latest_run_id: row.run_id
      };
      devices.set(deviceKey, device);
    }
    addPackageDetailDevice(device, row);
  }

  return {
    filters,
    package: {
      package_name: summary.package_name,
      normalized_name: summary.normalized_name,
      ecosystem: summary.ecosystem,
      profiles: sortedSet(summary.profiles),
      device_count: summary.devices.size,
      version_count: summary.versions.size,
      total_occurrence_count: summary.total_occurrence_count,
      package_managers: sortedSet(summary.package_managers),
      source_types: sortedSet(summary.source_types),
      root_kinds: sortedSet(summary.root_kinds),
      direct_dependency_present: booleanOrNull(summary.direct_dependency_seen, summary.direct_dependency_present),
      has_lifecycle_scripts: summary.has_lifecycle_scripts,
      latest_observed_at: summary.latest_observed_at,
      latest_run_id: summary.latest_run_id
    },
    versions: [...versions.values()]
      .sort((left, right) => String(left.version || "").localeCompare(String(right.version || "")))
      .map((version) => ({
        version: version.version,
        device_count: version.devices.size,
        occurrence_count: version.occurrence_count,
        package_managers: sortedSet(version.package_managers),
        source_types: sortedSet(version.source_types),
        root_kinds: sortedSet(version.root_kinds),
        direct_dependency_present: booleanOrNull(version.direct_dependency_seen, version.direct_dependency_present),
        has_lifecycle_scripts: version.has_lifecycle_scripts,
        latest_observed_at: version.latest_observed_at,
        latest_run_id: version.latest_run_id
      })),
    devices: [...devices.values()]
      .sort((left, right) => left.device_id.localeCompare(right.device_id) || left.profile.localeCompare(right.profile))
      .map((device) => ({
        device_id: device.device_id,
        profile: device.profile,
        versions: sortedSet(device.versions),
        version_count: device.versions.size,
        total_occurrence_count: device.total_occurrence_count,
        package_managers: sortedSet(device.package_managers),
        source_types: sortedSet(device.source_types),
        root_kinds: sortedSet(device.root_kinds),
        direct_dependency_present: booleanOrNull(device.direct_dependency_seen, device.direct_dependency_present),
        has_lifecycle_scripts: device.has_lifecycle_scripts,
        latest_observed_at: device.latest_observed_at,
        latest_run_id: device.latest_run_id
      })),
    observation_count: rows.length,
    truncated: rows.length >= filters.observation_limit
  };
}

function addPackageDetailSummary(summary: PackageDetailAccumulator, row: NormalizedPackageRow): void {
  summary.profiles.add(row.profile);
  summary.devices.add(row.device_id);
  summary.versions.add(row.version || "");
  summary.total_occurrence_count++;
  addCommonPackageDetail(summary, row);
}

function addPackageDetailVersion(version: PackageDetailVersionAccumulator, row: NormalizedPackageRow): void {
  version.devices.add(row.device_id);
  version.occurrence_count++;
  addCommonPackageDetail(version, row);
}

function addPackageDetailDevice(device: PackageDetailDeviceAccumulator, row: NormalizedPackageRow): void {
  device.versions.add(row.version || "");
  device.total_occurrence_count++;
  addCommonPackageDetail(device, row);
}

function addCommonPackageDetail(
  target: {
    package_managers: Set<string>;
    source_types: Set<string>;
    root_kinds: Set<string>;
    direct_dependency_seen: boolean;
    direct_dependency_present: boolean;
    has_lifecycle_scripts: boolean;
    latest_observed_at: string;
    latest_run_id: string | null;
  },
  row: NormalizedPackageRow
): void {
  if (row.package_manager) target.package_managers.add(row.package_manager);
  if (row.source_type) target.source_types.add(row.source_type);
  if (row.root_kind) target.root_kinds.add(row.root_kind);
  if (row.direct_dependency !== null && row.direct_dependency !== undefined) {
    target.direct_dependency_seen = true;
    target.direct_dependency_present ||= !!row.direct_dependency;
  }
  target.has_lifecycle_scripts ||= !!row.has_lifecycle_scripts;
  if (row.observed_at >= target.latest_observed_at) {
    target.latest_observed_at = row.observed_at;
    target.latest_run_id = row.run_id;
  }
}

function sortedSet(values: Set<string>): string[] {
  return [...values].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function booleanOrNull(seen: boolean, value: boolean): boolean | null {
  return seen ? value : null;
}

function packageFamilyKey(row: { device_id: string; profile: string; ecosystem: string; normalized_name: string }): string {
  return [row.device_id, row.profile, row.ecosystem, row.normalized_name].join("\u001f");
}

function splitGroupedValues(value: string | null): string[] {
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function rowsWithCounts(rows: AdminRunRow[]): object[] {
  return rows.map((row) => ({
    device_id: row.device_id,
    run_id: row.run_id,
    profile: row.profile,
    status: row.status,
    scanner_version: row.scanner_version,
    received_at: row.received_at,
    batch_count: row.batch_count || 0,
    record_count: row.record_count || 0
  }));
}

function formatNormalizationJobRow(row: AdminNormalizationJobRow): object {
  return {
    batch_id: row.batch_id,
    device_id: row.device_id,
    run_id: row.run_id,
    status: row.status,
    records_seen: row.records_seen || 0,
    packages_seen: row.packages_seen || 0,
    findings_seen: row.findings_seen || 0,
    promoted_current: !!row.promoted_current,
    error: safeNormalizationError(row.error),
    started_at: row.started_at,
    completed_at: row.completed_at
  };
}

function formatFindingRow(row: AdminFindingRow): object {
  return {
    device_id: row.device_id,
    run_id: row.run_id,
    record_id: row.record_id,
    profile: row.profile,
    finding_type: row.finding_type,
    severity: row.severity,
    catalog_id: row.catalog_id,
    catalog_name: row.catalog_name,
    ecosystem: row.ecosystem,
    package_name: row.package_name,
    normalized_name: row.normalized_name,
    version: row.version,
    root_kind: row.root_kind,
    source_type: row.source_type,
    confidence: row.confidence,
    evidence: safeFindingEvidence(row.evidence),
    received_at: row.received_at
  };
}

function safeNormalizationError(error: string | null): string | null {
  if (!error) {
    return null;
  }
  return error
    .replace(/[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+\/[A-Fa-f0-9]{32,}\.ndjson(?:\.gz)?/g, "[redacted-object-key]")
    .replace(/\\\\[^\\\s"'<>]+\\[^\s"'<>]+/g, "[redacted-path]")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[redacted-path]")
    .replace(/\/[^\s"'<>]+/g, "[redacted-path]")
    .replace(/S-\d-\d+(?:-\d+){1,14}/g, "[redacted-sid]")
    .slice(0, 500);
}

function safeFindingEvidence(evidence: string | null): string | null {
  if (!evidence) {
    return null;
  }
  return evidence
    .replace(/\\\\[^\\\s"'<>]+\\[^\s"'<>]+/g, "[redacted-path]")
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[redacted-path]")
    .replace(/\/[^\s"'<>]+/g, "[redacted-path]")
    .replace(/S-\d-\d+(?:-\d+){1,14}/g, "[redacted-sid]")
    .slice(0, 500);
}

function formatLifecycleEventRow(row: AdminLifecycleEventRow): object {
  return {
    event_id: row.event_id,
    device_id: row.device_id,
    action: row.action,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    reason: row.reason,
    previous_disabled_at: row.previous_disabled_at,
    new_disabled_at: row.new_disabled_at,
    created_at: row.created_at
  };
}

type HealthStatus = "healthy" | "stale" | "attention" | "unknown";
type AttentionSeverity = "critical" | "warning";
type AttentionReason =
  | "latest_run_not_complete"
  | "latest_complete_run_too_old"
  | "no_monitored_profile_run"
  | "normalization_missing"
  | "normalization_error"
  | "normalization_processing_stale"
  | "normalization_not_promoted";

interface HealthConfig {
  profile: string;
  expectedCadenceHours: number;
  staleHours: number;
  weekendGraceHours: number;
}

interface AttentionConfig extends HealthConfig {
  normalizationProcessingStaleMinutes: number;
}

interface HealthDevice {
  device_id: string;
  environment?: DeviceEnvironment;
  health: HealthStatus;
  reason: string;
  profile: string;
  expected_cadence_hours: number;
  stale_after_hours: number;
  age_hours: number | null;
  last_completed_received_at: string | null;
  last_completed_run_id: string | null;
  last_run: {
    run_id: string;
    status: string | null;
    scanner_version: string | null;
    received_at: string | null;
  } | null;
}

interface AttentionItem {
  device_id: string;
  severity: AttentionSeverity;
  reason: AttentionReason;
  profile: string;
  observed_at: string | null;
  age_hours: number | null;
  stale_after_hours: number;
  run: {
    run_id: string | null;
    status: string | null;
    scanner_version: string | null;
    received_at: string | null;
    completed_run_id: string | null;
    completed_received_at: string | null;
  };
  normalization_job: {
    status: string;
    records_seen: number;
    packages_seen: number;
    findings_seen: number;
    promoted_current: boolean;
    error: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
}

const attentionSeverityByReason: Record<AttentionReason, AttentionSeverity> = {
  latest_run_not_complete: "critical",
  latest_complete_run_too_old: "warning",
  no_monitored_profile_run: "warning",
  normalization_missing: "warning",
  normalization_error: "critical",
  normalization_processing_stale: "critical",
  normalization_not_promoted: "warning"
};

function healthConfig(env: Env): HealthConfig {
  const profile = (env.HEALTH_PROFILE || defaultHealthProfile).trim() || defaultHealthProfile;
  return {
    profile,
    expectedCadenceHours: positiveInt(env.HEALTH_EXPECTED_CADENCE_HOURS, defaultHealthExpectedCadenceHours),
    staleHours: positiveInt(env.HEALTH_STALE_HOURS, defaultHealthStaleHours),
    weekendGraceHours: nonNegativeInt(env.HEALTH_WEEKEND_GRACE_HOURS, defaultHealthWeekendGraceHours)
  };
}

function attentionConfig(env: Env): AttentionConfig {
  return {
    ...healthConfig(env),
    normalizationProcessingStaleMinutes: positiveInt(env.NORMALIZATION_PROCESSING_STALE_MINUTES, defaultNormalizationProcessingStaleMinutes)
  };
}

function isAttentionReason(value: string): value is AttentionReason {
  return Object.prototype.hasOwnProperty.call(attentionSeverityByReason, value);
}

function severityRank(value: AttentionSeverity): number {
  return value === "critical" ? 0 : 1;
}

function normalizationAttentionReason(job: AdminNormalizationJobRow | null, config: AttentionConfig, now: Date): AttentionReason | null {
  if (!job) {
    return "normalization_missing";
  }
  if (job.status === "error") {
    return "normalization_error";
  }
  if (job.status === "processing") {
    const startedAt = parseDate(job.started_at);
    if (startedAt && now.getTime() - startedAt.getTime() > config.normalizationProcessingStaleMinutes * 60000) {
      return "normalization_processing_stale";
    }
    return null;
  }
  if (job.status === "complete" && !job.promoted_current) {
    return "normalization_not_promoted";
  }
  return null;
}

function attentionItem(
  device: HealthDevice,
  reason: AttentionReason,
  job: AdminNormalizationJobRow | null,
  config: AttentionConfig,
  now: Date
): AttentionItem {
  const jobStarted = job ? parseDate(job.started_at) : null;
  const observedAt = job?.completed_at || job?.started_at || device.last_run?.received_at || device.last_completed_received_at;
  return {
    device_id: device.device_id,
    severity: attentionSeverityByReason[reason],
    reason,
    profile: config.profile,
    observed_at: observedAt || null,
    age_hours: jobStarted ? roundHours((now.getTime() - jobStarted.getTime()) / 3600000) : device.age_hours,
    stale_after_hours: device.stale_after_hours,
    run: {
      run_id: device.last_run?.run_id || null,
      status: device.last_run?.status || null,
      scanner_version: device.last_run?.scanner_version || null,
      received_at: device.last_run?.received_at || null,
      completed_run_id: device.last_completed_run_id,
      completed_received_at: device.last_completed_received_at
    },
    normalization_job: job ? {
      status: job.status,
      records_seen: job.records_seen || 0,
      packages_seen: job.packages_seen || 0,
      findings_seen: job.findings_seen || 0,
      promoted_current: !!job.promoted_current,
      error: safeNormalizationError(job.error),
      started_at: job.started_at,
      completed_at: job.completed_at
    } : null
  };
}

function attentionCounts(items: AttentionItem[]): object {
  const reasons = Object.fromEntries(Object.keys(attentionSeverityByReason).map((reason) => [reason, 0])) as Record<AttentionReason, number>;
  const counts = { total: items.length, critical: 0, warning: 0, reasons };
  for (const item of items) {
    counts[item.severity]++;
    counts.reasons[item.reason]++;
  }
  return counts;
}

function formatHealthRow(row: AdminHealthRow, config: HealthConfig, now: Date): HealthDevice {
  const latestCompleteAt = parseDate(row.last_complete_received_at);
  const staleAfterHours = effectiveStaleHours(latestCompleteAt, now, config);
  const ageHours = latestCompleteAt ? roundHours((now.getTime() - latestCompleteAt.getTime()) / 3600000) : null;
  const latestStatus = row.last_run_status || "";
  let health: HealthStatus = "unknown";
  let reason = "no_monitored_profile_run";

  if (row.last_run_id && latestStatus !== "complete") {
    health = "attention";
    reason = "latest_run_not_complete";
  } else if (latestCompleteAt && ageHours !== null) {
    if (ageHours > staleAfterHours) {
      health = "stale";
      reason = "latest_complete_run_too_old";
    } else {
      health = "healthy";
      reason = staleAfterHours > config.staleHours ? "latest_complete_run_within_weekend_grace" : "latest_complete_run_recent";
    }
  }

  return {
    device_id: row.device_id,
    environment: row.environment || "production",
    health,
    reason,
    profile: config.profile,
    expected_cadence_hours: config.expectedCadenceHours,
    stale_after_hours: staleAfterHours,
    age_hours: ageHours,
    last_completed_received_at: row.last_complete_received_at,
    last_completed_run_id: row.last_complete_run_id,
    last_run: row.last_run_id ? {
      run_id: row.last_run_id,
      status: row.last_run_status,
      scanner_version: row.last_run_scanner_version,
      received_at: row.last_run_received_at
    } : null
  };
}

function effectiveStaleHours(latestCompleteAt: Date | null, now: Date, config: HealthConfig): number {
  if (
    latestCompleteAt &&
    config.weekendGraceHours > config.staleHours &&
    intervalTouchesWeekend(latestCompleteAt, now)
  ) {
    return config.weekendGraceHours;
  }
  return config.staleHours;
}

function intervalTouchesWeekend(start: Date, end: Date): boolean {
  if (start.getTime() > end.getTime()) {
    return false;
  }
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) {
      return true;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return false;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}

async function allRows<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results || [];
}

async function runStatements(env: Env, statements: D1PreparedStatement[], chunkSize = 50): Promise<void> {
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize);
    if (chunk.length === 0) {
      continue;
    }
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(chunk);
    } else {
      for (const statement of chunk) {
        await statement.run();
      }
    }
  }
}

function requireAccess(request: Request, env: Env): void {
  // Cloudflare Access consumes service-token headers at the edge and forwards
  // an application JWT to the Worker. Keep direct header support for local
  // development and non-Access deployments.
  if (request.headers.get(accessJWTHeader)) {
    return;
  }

  const clientID = request.headers.get(accessClientIDHeader);
  const clientSecret = request.headers.get(accessClientSecretHeader);
  if (!constantTimeEqual(clientID || "", env.ACCESS_CLIENT_ID) ||
      !constantTimeEqual(clientSecret || "", env.ACCESS_CLIENT_SECRET)) {
    throw new HttpError(401, "invalid_access_token");
  }
}

function requireAdminRequest(request: Request, env: Env): void {
  requireAccess(request, env);
  requireAdminToken(request, env);
}

async function requireUIAdminRequest(request: Request, env: Env): Promise<JWTPayload> {
  const token = request.headers.get(accessJWTHeader);
  if (!token) {
    throw new HttpError(403, "missing_access_jwt");
  }
  const teamDomain = normalizeAccessTeamDomain(env.ACCESS_TEAM_DOMAIN || "");
  if (!teamDomain || !env.ACCESS_AUD) {
    throw new HttpError(503, "missing_access_jwt_config");
  }
  const issuer = `https://${teamDomain}`;
  const certsURL = `${issuer}/cdn-cgi/access/certs`;
  let jwks = accessJWKSByURL.get(certsURL);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(certsURL));
    accessJWKSByURL.set(certsURL, jwks);
  }
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, jwks, {
      audience: env.ACCESS_AUD,
      issuer
    });
    payload = verified.payload;
  } catch {
    throw new HttpError(403, "invalid_access_jwt");
  }
  return payload;
}

async function requireUIAdminActionRequest(request: Request, env: Env): Promise<UIAdminActor> {
  const actor = uiActorFromPayload(await requireUIAdminRequest(request, env));
  const allowedEmails = csvSet(env.UI_ADMIN_ACTION_EMAILS);
  const allowedDomains = csvSet(env.UI_ADMIN_ACTION_DOMAINS);
  if (allowedEmails.size === 0 && allowedDomains.size === 0) {
    throw new HttpError(403, "ui_admin_actions_not_configured");
  }
  const email = actor.email.toLowerCase();
  const domain = email.includes("@") ? email.split("@").at(-1) || "" : "";
  if (!allowedEmails.has(email) && !allowedDomains.has(domain)) {
    throw new HttpError(403, "ui_admin_action_forbidden");
  }
  return actor;
}

function uiActorFromPayload(payload: JWTPayload): UIAdminActor {
  const emailClaim = payload.email;
  const email = typeof emailClaim === "string" ? emailClaim.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    throw new HttpError(403, "ui_admin_actor_unavailable");
  }
  return {
    type: "ui",
    id: email,
    email
  };
}

function csvSet(value: string | undefined): Set<string> {
  return new Set((value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean));
}

function requireAdminToken(request: Request, env: Env): void {
  const token = request.headers.get(adminTokenHeader);
  if (!token || !constantTimeEqual(token, env.ADMIN_TOKEN)) {
    throw new HttpError(401, "invalid_admin_token");
  }
}

function boundedIntParam(params: URLSearchParams, name: string, fallback: number, max: number): number {
  const value = params.get(name);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, `invalid_${name}`);
  }
  return Math.min(parsed, max);
}

function textField(value: string | undefined): string {
  return (value || "").trim();
}

function textOrNull(value: string | undefined): string | null {
  const text = textField(value);
  return text || null;
}

function requiredText(value: string | undefined): string {
  const text = textField(value);
  if (!text) {
    throw new HttpError(400, "invalid_inventory_record");
  }
  return text;
}

function boolOrNull(value: boolean | undefined): number | null {
  return value === undefined ? null : value ? 1 : 0;
}

function requireContentType(request: Request): void {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/x-ndjson")) {
    throw new HttpError(415, "unsupported_content_type");
  }
}

async function loadDevice(env: Env, deviceID: string): Promise<DeviceRow> {
  const row = await env.DB.prepare(
    "SELECT hmac_key_ciphertext, hmac_key_nonce FROM devices WHERE device_id = ? AND disabled_at IS NULL"
  ).bind(deviceID).first<DeviceRow>();
  if (!row) {
    throw new HttpError(401, "unknown_device");
  }
  return row;
}

async function verifyInventorySignature(request: Request, rawBody: Uint8Array, key: string, env: Env): Promise<void> {
  const signature = request.headers.get(signatureHeader) || "";
  if (!signature.startsWith("sha256=")) {
    throw new HttpError(401, "missing_signature");
  }
  const timestamp = request.headers.get(timestampHeader) || "";
  const signedPayload = timestamp
    ? concatBytes(new TextEncoder().encode(`${timestamp}.`), rawBody)
    : rawBody;

  if (timestamp) {
    const ts = Number.parseInt(timestamp, 10);
    const skew = positiveInt(env.TIMESTAMP_SKEW_SECONDS, defaultTimestampSkewSeconds);
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > skew) {
      throw new HttpError(401, "invalid_timestamp");
    }
  }

  const expected = `sha256=${await hmacSha256Hex(key, signedPayload)}`;
  if (!constantTimeEqual(signature, expected)) {
    throw new HttpError(401, "invalid_signature");
  }
}

function parseNDJSON(text: string): InventoryRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    throw new HttpError(400, "empty_ndjson");
  }
  return lines.map((line) => {
    try {
      return JSON.parse(line) as InventoryRecord;
    } catch {
      throw new HttpError(400, "invalid_ndjson");
    }
  });
}

function validateRecords(records: InventoryRecord[], deviceID: string): ValidatedRecords {
  let summary: InventoryRecord | null = null;
  let runID = "";
  for (const record of records) {
    if (!record.record_type) {
      throw new HttpError(400, "missing_record_type");
    }
    if (!["package", "finding", "scan_summary"].includes(record.record_type)) {
      throw new HttpError(400, "unsupported_record_type");
    }
    if (record.endpoint?.device_id && record.endpoint.device_id !== deviceID) {
      throw new HttpError(400, "device_id_mismatch");
    }
    if (!record.run_id) {
      throw new HttpError(400, "missing_run_id");
    }
    runID ||= record.run_id;
    if (record.run_id !== runID) {
      throw new HttpError(400, "mixed_run_ids");
    }
    if (record.record_type === "scan_summary") {
      summary = record;
    }
  }
  return { runID, summary };
}

async function gunzipToText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function readOptionalJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function lifecycleReason(value: string | undefined, required: boolean): string {
  const reason = (value || "").trim();
  if (!reason) {
    if (required) {
      throw new HttpError(400, "missing_reason");
    }
    return "script_operator_action";
  }
  if (reason.length < 3) {
    throw new HttpError(400, "invalid_reason");
  }
  if (reason.length > 500) {
    throw new HttpError(400, "reason_too_long");
  }
  return reason;
}

function sanitizeDeviceID(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function sanitizeOpaqueID(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function isSafeFilterToken(value: string): boolean {
  return value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function normalizeAccessTeamDomain(value: string): string {
  const withoutProtocol = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9.-]+$/.test(withoutProtocol) ? withoutProtocol : "";
}

async function encryptSecret(env: Env, secret: string): Promise<{ ciphertext: string; nonce: string }> {
  const key = await importAesKey(env.HIVE_KEY_ENCRYPTION_KEY);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(secret));
  return { ciphertext: bytesToBase64url(new Uint8Array(ciphertext)), nonce: bytesToBase64url(nonce) };
}

async function decryptSecret(env: Env, row: DeviceRow): Promise<string> {
  const key = await importAesKey(env.HIVE_KEY_ENCRYPTION_KEY);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64urlToBytes(row.hmac_key_nonce)) },
    key,
    toArrayBuffer(base64urlToBytes(row.hmac_key_ciphertext))
  );
  return new TextDecoder().decode(plaintext);
}

async function importAesKey(base64urlKey: string): Promise<CryptoKey> {
  const raw = base64urlToBytes(base64urlKey);
  if (raw.byteLength !== 32) {
    throw new HttpError(500, "invalid_key_encryption_key");
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function hmacSha256Hex(key: string, payload: Uint8Array): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(key)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(payload));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(payload: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(payload))));
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function adminJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const testInternals = {
  encryptSecret,
  hmacSha256Hex,
  normalizeQueuedBatch,
  normalizeAccessTeamDomain
};
