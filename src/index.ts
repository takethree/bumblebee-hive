import { createRemoteJWKSet, jwtVerify } from "jose";

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
}

interface InventoryRecord {
  record_type?: string;
  run_id?: string;
  profile?: string;
  scanner_version?: string;
  status?: string;
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

interface RetentionBatchRow {
  batch_id: string;
  object_key: string;
}

interface RetentionRunRow {
  device_id: string;
  profile: string;
  run_id: string;
}

interface ValidatedRecords {
  runID: string;
  summary: InventoryRecord | null;
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
const accessJWKSByURL = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

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
        return await ingest(request, env);
      }
      const disableMatch = url.pathname.match(/^\/v1\/admin\/devices\/([^/]+)\/disable$/);
      if (request.method === "POST" && disableMatch) {
        return await disableDevice(request, env, disableMatch[1]);
      }
      if (request.method === "POST" && url.pathname === "/v1/admin/retention/run") {
        return await runRetentionAdmin(request, env, url);
      }
      if (request.method === "GET" && url.pathname === "/v1/admin/overview") {
        return await adminOverview(request, env);
      }
      if (request.method === "GET" && url.pathname === "/v1/ui/admin/overview") {
        return await uiAdminOverview(request, env);
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
      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "internal_error";
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: message }, status);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runRetention(env, { dryRun: false }));
  }
};

async function serveAdminAsset(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ASSETS) {
    throw new HttpError(404, "admin_ui_not_configured");
  }
  return env.ASSETS.fetch(new Request(url, request));
}

async function enroll(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  const token = request.headers.get("X-Hive-Enroll-Token");
  if (!token || !constantTimeEqual(token, env.ENROLLMENT_TOKEN)) {
    throw new HttpError(401, "invalid_enrollment_token");
  }

  const body = await readOptionalJson<{ device_id?: string }>(request);
  const deviceID = sanitizeDeviceID(body.device_id || "") || crypto.randomUUID();
  const hmacKey = bytesToBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const encrypted = await encryptSecret(env, hmacKey);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO devices (device_id, hmac_key_ciphertext, hmac_key_nonce, created_at, disabled_at) VALUES (?, ?, ?, ?, NULL)"
  ).bind(deviceID, encrypted.ciphertext, encrypted.nonce, now).run();

  return json({
    device_id: deviceID,
    hmac_key: hmacKey,
    ingest_path: "/v1/ingest",
    required_headers: [accessClientIDHeader, accessClientSecretHeader, deviceHeader]
  }, 201);
}

async function ingest(request: Request, env: Env): Promise<Response> {
  requireAccess(request, env);
  requireContentType(request);

  const deviceID = sanitizeDeviceID(request.headers.get(deviceHeader) || "");
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

async function disableDevice(request: Request, env: Env, rawDeviceID: string): Promise<Response> {
  requireAccess(request, env);
  requireAdminToken(request, env);

  const deviceID = sanitizeDeviceID(decodeURIComponent(rawDeviceID));
  if (!deviceID) {
    throw new HttpError(400, "invalid_device_id");
  }

  const disabledAt = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE devices SET disabled_at = ? WHERE device_id = ? AND disabled_at IS NULL"
  ).bind(disabledAt, deviceID).run();
  const changes = typeof result.meta?.changes === "number" ? result.meta.changes : 0;
  if (changes === 0) {
    throw new HttpError(404, "device_not_found");
  }

  return json({ ok: true, device_id: deviceID, disabled_at: disabledAt });
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

async function adminOverview(request: Request, env: Env): Promise<Response> {
  requireAdminRequest(request, env);
  return adminJson(await adminOverviewData(env));
}

async function uiAdminOverview(request: Request, env: Env): Promise<Response> {
  await requireUIAdminRequest(request, env);
  return adminJson(await adminOverviewData(env));
}

async function adminOverviewData(env: Env): Promise<object> {
  const devices = await env.DB.prepare(
    "SELECT COUNT(*) AS total_devices, SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active_devices, SUM(CASE WHEN disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled_devices FROM devices"
  ).first<AdminOverviewRow>();
  const runs = await env.DB.prepare(
    "SELECT COUNT(*) AS total_runs, SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete_runs, MAX(received_at) AS latest_run_received_at FROM runs"
  ).first<AdminRunOverviewRow>();
  const batches = await env.DB.prepare(
    "SELECT COUNT(*) AS total_batches, SUM(record_count) AS total_records FROM batches"
  ).first<AdminBatchTotalRow>();

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
  const limit = boundedIntParam(url.searchParams, "limit", 50, 100);
  const offset = boundedIntParam(url.searchParams, "offset", 0, 100000);
  const where = status === "active"
    ? "WHERE d.disabled_at IS NULL"
    : status === "disabled"
      ? "WHERE d.disabled_at IS NOT NULL"
      : "";
  const rows = await allRows<AdminDeviceRow>(
    env.DB.prepare(`${adminDeviceSelect()} ${where} ORDER BY COALESCE(last_run_received_at, d.created_at) DESC LIMIT ? OFFSET ?`).bind(limit, offset)
  );

  return {
    devices: rows.map(formatAdminDeviceRow),
    limit,
    offset,
    status
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

  return {
    device: formatAdminDeviceRow(device),
    recent_runs: rowsWithCounts(runs)
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
  values.push(limit, offset);
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await allRows<AdminRunRow>(
    env.DB.prepare(`${adminRunSelect()} ${whereSQL} ORDER BY r.received_at DESC LIMIT ? OFFSET ?`).bind(...values)
  );

  return {
    runs: rowsWithCounts(rows),
    limit,
    offset
  };
}

function adminDeviceSelect(): string {
  return `SELECT
    d.device_id,
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

function formatAdminDeviceRow(row: AdminDeviceRow): object {
  return {
    device_id: row.device_id,
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

async function allRows<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results || [];
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

async function requireUIAdminRequest(request: Request, env: Env): Promise<void> {
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
  try {
    await jwtVerify(token, jwks, {
      audience: env.ACCESS_AUD,
      issuer
    });
  } catch {
    throw new HttpError(403, "invalid_access_jwt");
  }
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

function sanitizeDeviceID(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return "";
  }
  return trimmed;
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
  normalizeAccessTeamDomain
};
