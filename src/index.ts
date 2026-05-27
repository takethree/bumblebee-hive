export interface Env {
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ENROLLMENT_TOKEN: string;
  HIVE_KEY_ENCRYPTION_KEY: string;
  RAW_BATCHES: R2Bucket;
  DB: D1Database;
  NORMALIZE_QUEUE?: Queue;
  MAX_BODY_BYTES?: string;
  TIMESTAMP_SKEW_SECONDS?: string;
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
const defaultMaxBodyBytes = 5 * 1024 * 1024;
const defaultTimestampSkewSeconds = 300;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/v1/health") {
        return json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/v1/enroll") {
        return await enroll(request, env);
      }
      if (request.method === "POST" && url.pathname === "/v1/ingest") {
        return await ingest(request, env);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "internal_error";
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: message }, status);
    }
  }
};

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

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const testInternals = {
  encryptSecret,
  hmacSha256Hex
};
