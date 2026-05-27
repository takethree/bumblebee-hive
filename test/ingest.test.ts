import { gzipSync } from "node:zlib";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { Env, testInternals } from "../src/index";

class MemoryR2 {
  objects = new Map<string, Uint8Array>();

  async put(key: string, value: Uint8Array): Promise<void> {
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class MemoryQueue {
  messages: unknown[] = [];

  async send(message: unknown): Promise<void> {
    this.messages.push(message);
  }
}

class MemoryAssets {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/admin/") {
      return new Response("<!doctype html><title>Bumblebee Hive Admin</title>", {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    return new Response("asset", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

class MemoryStmt {
  private values: unknown[] = [];

  constructor(private readonly db: MemoryD1, private readonly sql: string) {}

  bind(...values: unknown[]): MemoryStmt {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.startsWith("SELECT hmac_key_ciphertext")) {
      const device = this.db.devices.get(String(this.values[0]));
      if (device?.disabled_at) {
        return null;
      }
      if (!device) {
        return null;
      }
      return {
        hmac_key_ciphertext: device.hmac_key_ciphertext,
        hmac_key_nonce: device.hmac_key_nonce
      } as T;
    }
    if (this.sql.startsWith("SELECT disabled_at FROM devices")) {
      const device = this.db.devices.get(String(this.values[0]));
      return device ? { disabled_at: device.disabled_at } as T : null;
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS total_devices")) {
      const devices = [...this.db.devices.values()];
      return {
        total_devices: devices.length,
        active_devices: devices.filter((device) => !device.disabled_at).length,
        disabled_devices: devices.filter((device) => device.disabled_at).length
      } as T;
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS total_runs")) {
      const received = this.db.runRows().map((run) => run.received_at).sort();
      return {
        total_runs: this.db.runs.length,
        complete_runs: this.db.runRows().filter((run) => run.status === "complete").length,
        latest_run_received_at: received.at(-1) || null
      } as T;
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS total_batches")) {
      return {
        total_batches: this.db.batches.length,
        total_records: this.db.batchRows().reduce((total, batch) => total + batch.record_count, 0)
      } as T;
    }
    if (this.sql.includes("FROM devices d") && this.sql.includes("WHERE d.device_id = ?")) {
      return (this.db.adminDeviceRows().find((row) => row.device_id === String(this.values[0])) || null) as T | null;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.startsWith("SELECT batch_id, object_key")) {
      const cutoff = String(this.values[0]);
      const limit = Number(this.values[1]);
      const rows = this.db.batchRows()
        .filter((row) => row.received_at < cutoff)
        .sort((left, right) => left.received_at.localeCompare(right.received_at))
        .slice(0, limit);
      return { results: rows.map((row) => ({ batch_id: row.batch_id, object_key: row.object_key })) as T[] };
    }
    if (this.sql.includes("FROM runs r") && this.sql.includes("NOT EXISTS")) {
      const cutoff = String(this.values[0]);
      const limit = Number(this.values[1]);
      const batches = this.db.batchRows();
      const rows = this.db.runRows()
        .filter((run) => run.received_at < cutoff)
        .filter((run) => !batches.some((batch) => batch.device_id === run.device_id && batch.run_id === run.run_id))
        .sort((left, right) => left.received_at.localeCompare(right.received_at))
        .slice(0, limit);
      return { results: rows.map((row) => ({ device_id: row.device_id, profile: row.profile, run_id: row.run_id })) as T[] };
    }
    if (this.sql.includes("last_complete_received_at")) {
      const profile = String(this.values[0]);
      return { results: this.db.healthRows(profile) as T[] };
    }
    if (this.sql.includes("FROM devices d")) {
      let rows = this.db.adminDeviceRows();
      if (this.sql.includes("WHERE d.disabled_at IS NULL")) {
        rows = rows.filter((row) => !row.disabled_at);
      } else if (this.sql.includes("WHERE d.disabled_at IS NOT NULL")) {
        rows = rows.filter((row) => row.disabled_at);
      }
      return { results: this.page(rows) as T[] };
    }
    if (this.sql.includes("FROM device_lifecycle_events")) {
      return { results: this.db.lifecycleEventRows(String(this.values[0])).slice(0, 10) as T[] };
    }
    if (this.sql.includes("FROM runs r")) {
      let rows = this.db.adminRunRows();
      let valueIndex = 0;
      if (this.sql.includes("r.device_id = ?")) {
        const deviceID = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.device_id === deviceID);
      }
      if (this.sql.includes("r.status = ?")) {
        const status = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.status === status);
      }
      if (this.sql.includes("r.profile = ?")) {
        const profile = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.profile === profile);
      }
      return { results: this.page(rows) as T[] };
    }
    return { results: [] };
  }

  async run(): Promise<D1Result> {
    if (this.sql.startsWith("INSERT INTO devices")) {
      this.db.devices.set(String(this.values[0]), {
        hmac_key_ciphertext: String(this.values[1]),
        hmac_key_nonce: String(this.values[2]),
        created_at: String(this.values[3]),
        disabled_at: null
      });
    } else if (this.sql.startsWith("INSERT INTO batches")) {
      this.db.batches.push(this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO runs")) {
      const [deviceID, profile, runID] = this.values.map(String);
      this.db.runs = this.db.runs.filter((run) => String(run[0]) !== deviceID || String(run[1]) !== profile || String(run[2]) !== runID);
      this.db.runs.push(this.values);
    } else if (this.sql.startsWith("UPDATE devices SET disabled_at = NULL")) {
      const device = this.db.devices.get(String(this.values[0]));
      if (device && device.disabled_at) {
        device.disabled_at = null;
        return { success: true, meta: { duration: 0, changes: 1 } } as D1Result;
      }
      return { success: true, meta: { duration: 0, changes: 0 } } as D1Result;
    } else if (this.sql.startsWith("UPDATE devices SET disabled_at")) {
      const device = this.db.devices.get(String(this.values[1]));
      if (device && !device.disabled_at) {
        device.disabled_at = String(this.values[0]);
        return { success: true, meta: { duration: 0, changes: 1 } } as D1Result;
      }
      return { success: true, meta: { duration: 0, changes: 0 } } as D1Result;
    } else if (this.sql.startsWith("INSERT INTO device_lifecycle_events")) {
      this.db.lifecycleEvents.push(this.values);
    } else if (this.sql.startsWith("DELETE FROM batches")) {
      const ids = new Set(this.values.map(String));
      const before = this.db.batches.length;
      this.db.batches = this.db.batches.filter((batch) => !ids.has(String(batch[0])));
      return { success: true, meta: { duration: 0, changes: before - this.db.batches.length } } as D1Result;
    } else if (this.sql.startsWith("DELETE FROM runs")) {
      const triples: Array<{ device_id: string; profile: string; run_id: string }> = [];
      for (let i = 0; i < this.values.length; i += 3) {
        triples.push({
          device_id: String(this.values[i]),
          profile: String(this.values[i + 1]),
          run_id: String(this.values[i + 2])
        });
      }
      const before = this.db.runs.length;
      this.db.runs = this.db.runs.filter((run) => !triples.some((triple) =>
        triple.device_id === String(run[0]) &&
        triple.profile === String(run[1]) &&
        triple.run_id === String(run[2])
      ));
      return { success: true, meta: { duration: 0, changes: before - this.db.runs.length } } as D1Result;
    }
    return { success: true, meta: { duration: 0 } } as D1Result;
  }

  private page<T>(rows: T[]): T[] {
    rows.sort((left, right) => this.sortValue(right).localeCompare(this.sortValue(left)));
    const lastValue = this.values.at(-1);
    const previousValue = this.values.at(-2);
    const hasBoundPage = typeof lastValue === "number" && typeof previousValue === "number";
    const offset = hasBoundPage ? lastValue : 0;
    const limit = hasBoundPage ? previousValue : this.sql.includes("LIMIT 10") ? 10 : rows.length;
    return rows.slice(offset, offset + limit);
  }

  private sortValue(row: unknown): string {
    const typed = row as { last_run_received_at?: string | null; created_at?: string; received_at?: string };
    return typed.last_run_received_at || typed.received_at || typed.created_at || "";
  }
}

class MemoryD1 {
  devices = new Map<string, { hmac_key_ciphertext: string; hmac_key_nonce: string; created_at: string; disabled_at: string | null }>();
  batches: unknown[][] = [];
  runs: unknown[][] = [];
  lifecycleEvents: unknown[][] = [];

  prepare(sql: string): MemoryStmt {
    return new MemoryStmt(this, sql);
  }

  async batch(statements: MemoryStmt[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    for (const statement of statements) {
      results.push(await statement.run());
    }
    return results;
  }

  batchRows(): Array<{ batch_id: string; device_id: string; run_id: string; received_at: string; object_key: string; record_count: number }> {
    return this.batches.map((batch) => ({
      batch_id: String(batch[0]),
      device_id: String(batch[1]),
      run_id: String(batch[2]),
      received_at: String(batch[3]),
      object_key: String(batch[5]),
      record_count: Number(batch[7] || 0)
    }));
  }

  runRows(): Array<{ device_id: string; profile: string; run_id: string; status: string; scanner_version: string | null; received_at: string }> {
    return this.runs.map((run) => ({
      device_id: String(run[0]),
      profile: String(run[1]),
      run_id: String(run[2]),
      status: String(run[3]),
      scanner_version: run[4] === null || run[4] === undefined ? null : String(run[4]),
      received_at: String(run[5])
    }));
  }

  adminDeviceRows(): Array<{
    device_id: string;
    created_at: string;
    disabled_at: string | null;
    run_count: number;
    batch_count: number;
    record_count: number;
    last_run_id: string | null;
    last_run_profile: string | null;
    last_run_status: string | null;
    last_run_scanner_version: string | null;
    last_run_received_at: string | null;
  }> {
    const runs = this.runRows();
    const batches = this.batchRows();
    return [...this.devices.entries()].map(([deviceID, device]) => {
      const deviceRuns = runs.filter((run) => run.device_id === deviceID)
        .sort((left, right) => right.received_at.localeCompare(left.received_at));
      const deviceBatches = batches.filter((batch) => batch.device_id === deviceID);
      const lastRun = deviceRuns[0];
      return {
        device_id: deviceID,
        created_at: device.created_at,
        disabled_at: device.disabled_at,
        run_count: deviceRuns.length,
        batch_count: deviceBatches.length,
        record_count: deviceBatches.reduce((total, batch) => total + batch.record_count, 0),
        last_run_id: lastRun?.run_id || null,
        last_run_profile: lastRun?.profile || null,
        last_run_status: lastRun?.status || null,
        last_run_scanner_version: lastRun?.scanner_version || null,
        last_run_received_at: lastRun?.received_at || null
      };
    });
  }

  adminRunRows(): Array<{
    device_id: string;
    run_id: string;
    profile: string;
    status: string;
    scanner_version: string | null;
    received_at: string;
    batch_count: number;
    record_count: number;
  }> {
    const batches = this.batchRows();
    return this.runRows().map((run) => {
      const runBatches = batches.filter((batch) => batch.device_id === run.device_id && batch.run_id === run.run_id);
      return {
        ...run,
        batch_count: runBatches.length,
        record_count: runBatches.reduce((total, batch) => total + batch.record_count, 0)
      };
    });
  }

  healthRows(profile: string): Array<{
    device_id: string;
    created_at: string;
    last_run_id: string | null;
    last_run_status: string | null;
    last_run_scanner_version: string | null;
    last_run_received_at: string | null;
    last_complete_received_at: string | null;
  }> {
    const runs = this.runRows();
    return [...this.devices.entries()]
      .filter(([, device]) => !device.disabled_at)
      .map(([deviceID, device]) => {
        const profileRuns = runs
          .filter((run) => run.device_id === deviceID && run.profile === profile)
          .sort((left, right) => right.received_at.localeCompare(left.received_at));
        const lastRun = profileRuns[0];
        const lastComplete = profileRuns.find((run) => run.status === "complete");
        return {
          device_id: deviceID,
          created_at: device.created_at,
          last_run_id: lastRun?.run_id || null,
          last_run_status: lastRun?.status || null,
          last_run_scanner_version: lastRun?.scanner_version || null,
          last_run_received_at: lastRun?.received_at || null,
          last_complete_received_at: lastComplete?.received_at || null
        };
      });
  }

  lifecycleEventRows(deviceID: string): Array<{
    event_id: string;
    device_id: string;
    action: string;
    actor_type: string;
    actor_id: string;
    reason: string;
    previous_disabled_at: string | null;
    new_disabled_at: string | null;
    created_at: string;
  }> {
    return this.lifecycleEvents
      .filter((event) => String(event[1]) === deviceID)
      .map((event) => ({
        event_id: String(event[0]),
        device_id: String(event[1]),
        action: String(event[2]),
        actor_type: String(event[3]),
        actor_id: String(event[4]),
        reason: String(event[5]),
        previous_disabled_at: event[6] === null || event[6] === undefined ? null : String(event[6]),
        new_disabled_at: event[7] === null || event[7] === undefined ? null : String(event[7]),
        created_at: String(event[8])
      }))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  }
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function makeEnv(): Env & { RAW_BATCHES: MemoryR2; DB: MemoryD1; NORMALIZE_QUEUE: MemoryQueue; ASSETS: MemoryAssets } {
  return {
    ACCESS_CLIENT_ID: "access-id",
    ACCESS_CLIENT_SECRET: "access-secret",
    ACCESS_TEAM_DOMAIN: "team.example.cloudflareaccess.com",
    ACCESS_AUD: "access-aud",
    ADMIN_TOKEN: "admin-token",
    ENROLLMENT_TOKEN: "enroll-token",
    HIVE_KEY_ENCRYPTION_KEY: base64url(crypto.getRandomValues(new Uint8Array(32))),
    RAW_BATCHES: new MemoryR2() as unknown as MemoryR2 & R2Bucket,
    DB: new MemoryD1() as unknown as MemoryD1 & D1Database,
    ASSETS: new MemoryAssets() as unknown as MemoryAssets & Fetcher,
    NORMALIZE_QUEUE: new MemoryQueue() as unknown as MemoryQueue & Queue
  };
}

async function addDevice(env: Env & { DB: MemoryD1 }, deviceID: string, hmacKey: string): Promise<void> {
  const encrypted = await testInternals.encryptSecret(env, hmacKey);
  env.DB.devices.set(deviceID, {
    hmac_key_ciphertext: encrypted.ciphertext,
    hmac_key_nonce: encrypted.nonce,
    created_at: new Date().toISOString(),
    disabled_at: null
  });
}

function adminHeaders(env: Env): HeadersInit {
  return {
    "CF-Access-Client-Id": env.ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.ACCESS_CLIENT_SECRET,
    "X-Hive-Admin-Token": env.ADMIN_TOKEN
  };
}

function forbiddenVisibilityFields(body: unknown): string[] {
  const text = JSON.stringify(body);
  return ["summary_json", "object_key", "hmac_key_ciphertext", "hmac_key_nonce", "body_sha256"]
    .filter((field) => text.includes(field));
}

let accessTestKeyPair: CryptoKeyPair | null = null;
let accessTestJWK: unknown | null = null;

async function accessJWT(env: Env, audience = env.ACCESS_AUD || "access-aud", email: string | null = "operator@example.test"): Promise<string> {
  if (!accessTestKeyPair || !accessTestJWK) {
    accessTestKeyPair = await generateKeyPair("RS256");
    const jwk = await exportJWK(accessTestKeyPair.publicKey);
    accessTestJWK = { ...jwk, kid: "test-key", alg: "RS256" };
  }
  const jwk = accessTestJWK;
  const certsURL = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url === certsURL) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  const payload = email ? { sub: email, email } : { sub: "service-token-smoke" };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(`https://${env.ACCESS_TEAM_DOMAIN}`)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(accessTestKeyPair.privateKey);
}

async function signedRequest(env: Env, body: Uint8Array, hmacKey: string, overrides: HeadersInit = {}): Promise<Request> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.byteLength + body.byteLength);
  payload.set(prefix);
  payload.set(body, prefix.byteLength);
  const signature = await testInternals.hmacSha256Hex(hmacKey, payload);
  return new Request("https://hive.example.test/v1/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Encoding": "gzip",
      "CF-Access-Client-Id": env.ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.ACCESS_CLIENT_SECRET,
      "X-Inventory-Device-Id": "device-1",
      "X-Inventory-Timestamp": timestamp,
      "X-Inventory-Signature": `sha256=${signature}`,
      ...overrides
    },
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  });
}

async function ingestSummary(env: Env & { DB: MemoryD1 }, deviceID: string, hmacKey: string, runID: string, profile = "baseline", status = "complete"): Promise<void> {
  await addDevice(env, deviceID, hmacKey);
  const ndjson = [
    JSON.stringify({ record_type: "package", run_id: runID, endpoint: { device_id: deviceID } }),
    JSON.stringify({ record_type: "scan_summary", run_id: runID, profile, status, scanner_version: "v-test", endpoint: { device_id: deviceID } })
  ].join("\n") + "\n";
  const response = await worker.fetch(await signedRequest(env, gzipSync(ndjson), hmacKey, {
    "X-Inventory-Device-Id": deviceID
  }), env);
  expect(response.status).toBe(200);
}

function setRunReceivedAt(env: Env & { DB: MemoryD1 }, runID: string, receivedAt: string): void {
  for (const batch of env.DB.batches) {
    if (String(batch[2]) === runID) {
      batch[3] = receivedAt;
    }
  }
  for (const run of env.DB.runs) {
    if (String(run[2]) === runID) {
      run[5] = receivedAt;
    }
  }
}

describe("bumblebee hive worker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the admin UI entry through the assets binding", async () => {
    const env = makeEnv();
    const redirect = await worker.fetch(new Request("https://hive.example.test/admin"), env);
    const page = await worker.fetch(new Request("https://hive.example.test/admin/"), env);

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("/admin/");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toContain("text/html");
    expect(await page.text()).toContain("Bumblebee Hive Admin");
  });

  it("enrolls a device behind Access", async () => {
    const env = makeEnv();
    const response = await worker.fetch(new Request("https://hive.example.test/v1/enroll", {
      method: "POST",
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "access-secret",
        "X-Hive-Enroll-Token": "enroll-token"
      },
      body: JSON.stringify({ device_id: "device-1" })
    }), env);

    expect(response.status).toBe(201);
    expect(env.DB.devices.has("device-1")).toBe(true);
    const body = await response.json() as { device_id: string; hmac_key: string };
    expect(body.device_id).toBe("device-1");
    expect(body.hmac_key.length).toBeGreaterThan(20);
  });

  it("accepts a valid gzip HMAC batch and records raw plus run index", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = [
      JSON.stringify({ record_type: "package", run_id: "run-1", endpoint: { device_id: "device-1" } }),
      JSON.stringify({ record_type: "scan_summary", run_id: "run-1", profile: "baseline", status: "complete", scanner_version: "v-test", endpoint: { device_id: "device-1" } })
    ].join("\n") + "\n";
    const request = await signedRequest(env, gzipSync(ndjson), hmacKey);

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(env.RAW_BATCHES.objects.size).toBe(1);
    expect(env.DB.batches).toHaveLength(1);
    expect(env.DB.runs).toHaveLength(1);
    expect(env.NORMALIZE_QUEUE.messages).toHaveLength(1);
  });

  it("accepts partial batches before the final scan summary", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = JSON.stringify({ record_type: "package", run_id: "run-1", endpoint: { device_id: "device-1" } }) + "\n";
    const request = await signedRequest(env, gzipSync(ndjson), hmacKey);

    const response = await worker.fetch(request, env);
    const body = await response.json() as { run_complete: boolean };

    expect(response.status).toBe(200);
    expect(body.run_complete).toBe(false);
    expect(env.RAW_BATCHES.objects.size).toBe(1);
    expect(env.DB.batches).toHaveLength(1);
    expect(env.DB.runs).toHaveLength(0);
    expect(env.NORMALIZE_QUEUE.messages).toHaveLength(1);
  });

  it("rejects invalid Access headers before ingest", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const request = await signedRequest(env, gzipSync("{}\n"), hmacKey, {
      "CF-Access-Client-Secret": "wrong"
    });

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(401);
  });

  it("disables a device through the admin endpoint and rejects later ingest", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);

    const disableResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "access-secret",
        "X-Hive-Admin-Token": "admin-token"
      }
    }), env);

    expect(disableResponse.status).toBe(200);
    expect(disableResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeTruthy();
    const disableBody = await disableResponse.json() as { event: { action: string; actor_type: string; reason: string } };
    expect(disableBody.event).toMatchObject({ action: "disable", actor_type: "script", reason: "script_operator_action" });
    expect(env.DB.lifecycleEvents).toHaveLength(1);

    const request = await signedRequest(env, gzipSync("{\"record_type\":\"scan_summary\",\"run_id\":\"run-1\"}\n"), hmacKey);
    const ingestResponse = await worker.fetch(request, env);

    expect(ingestResponse.status).toBe(401);
    expect(await ingestResponse.json()).toEqual({ error: "unknown_device" });
  });

  it("enables a disabled device through the admin endpoint and records audit events", async () => {
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");
    const disableResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: adminHeaders(env),
      body: JSON.stringify({ reason: "retire laptop" })
    }), env);
    const enableResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/enable", {
      method: "POST",
      headers: adminHeaders(env),
      body: JSON.stringify({ reason: "mistaken disable" })
    }), env);
    const enableBody = await enableResponse.json() as { device: { status: string; disabled_at: string | null }; event: { action: string; reason: string; previous_disabled_at: string | null; new_disabled_at: string | null } };

    expect(disableResponse.status).toBe(200);
    expect(enableResponse.status).toBe(200);
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeNull();
    expect(enableBody.device).toMatchObject({ status: "active", disabled_at: null });
    expect(enableBody.event).toMatchObject({
      action: "enable",
      reason: "mistaken disable",
      new_disabled_at: null
    });
    expect(enableBody.event.previous_disabled_at).toBeTruthy();
    expect(env.DB.lifecycleEvents).toHaveLength(2);
  });

  it("returns lifecycle conflicts instead of silently repeating device state changes", async () => {
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");

    const enableActive = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/enable", {
      method: "POST",
      headers: adminHeaders(env)
    }), env);
    const disable = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: adminHeaders(env)
    }), env);
    const disableAgain = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: adminHeaders(env)
    }), env);

    expect(enableActive.status).toBe(409);
    expect(await enableActive.json()).toEqual({ error: "device_already_active" });
    expect(disable.status).toBe(200);
    expect(disableAgain.status).toBe(409);
    expect(await disableAgain.json()).toEqual({ error: "device_already_disabled" });
  });

  it("rejects admin disable without the admin token", async () => {
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "access-secret"
      }
    }), env);

    expect(response.status).toBe(401);
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeNull();
  });

  it("rejects admin disable before token check when Access is invalid", async () => {
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1/disable", {
      method: "POST",
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "wrong",
        "X-Hive-Admin-Token": "admin-token"
      }
    }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_access_token" });
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeNull();
  });

  it("accepts Cloudflare Access forwarded JWT header", async () => {
    const env = makeEnv();
    const response = await worker.fetch(new Request("https://hive.example.test/v1/enroll", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": "edge-issued-jwt",
        "X-Hive-Enroll-Token": "enroll-token"
      },
      body: JSON.stringify({ device_id: "device-jwt" })
    }), env);

    expect(response.status).toBe(201);
    expect(env.DB.devices.has("device-jwt")).toBe(true);
  });

  it("rejects body signatures computed over a different gzip payload", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const request = await signedRequest(env, gzipSync("{\"record_type\":\"scan_summary\",\"run_id\":\"run-1\"}\n"), "wrong-key");

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(401);
  });

  it("accepts summary-only completion batches", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = JSON.stringify({ record_type: "scan_summary", run_id: "run-1", status: "complete", endpoint: { device_id: "device-1" } }) + "\n";
    const request = await signedRequest(env, gzipSync(ndjson), hmacKey);

    const response = await worker.fetch(request, env);
    const body = await response.json() as { run_complete: boolean };

    expect(response.status).toBe(200);
    expect(body.run_complete).toBe(true);
    expect(env.DB.batches).toHaveLength(1);
    expect(env.DB.runs).toHaveLength(1);
  });

  it("returns metadata-only admin overview", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1");
    await addDevice(env, "device-2", "device-secret-2");
    const device2 = env.DB.devices.get("device-2");
    expect(device2).toBeTruthy();
    device2!.disabled_at = "2026-05-26T00:00:00.000Z";

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/overview", {
      headers: adminHeaders(env)
    }), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      devices: { total: 2, active: 1, disabled: 1 },
      runs: { total: 1, complete: 1 },
      batches: { total: 1, records: 2 }
    });
    expect(forbiddenVisibilityFields(body)).toEqual([]);
  });

  it("returns UI admin metadata with a valid Access JWT and no admin token", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1");
    const token = await accessJWT(env);

    const response = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/overview", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      devices: { total: 1, active: 1, disabled: 0 },
      runs: { total: 1, complete: 1 },
      batches: { total: 1, records: 2 }
    });
    expect(forbiddenVisibilityFields(body)).toEqual([]);
  });

  it("allows UI read metadata without an email claim but rejects UI writes without an actor email", async () => {
    const env = makeEnv();
    env.UI_ADMIN_ACTION_DOMAINS = "example.test";
    await addDevice(env, "device-1", "device-secret");
    const token = await accessJWT(env, env.ACCESS_AUD, null);

    const readResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/overview", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);
    const writeResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": token },
      body: JSON.stringify({ reason: "developer offboarded" })
    }), env);

    expect(readResponse.status).toBe(200);
    expect(writeResponse.status).toBe(403);
    expect(await writeResponse.json()).toEqual({ error: "ui_admin_actor_unavailable" });
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeNull();
  });

  it("returns UI device detail and runs with a valid Access JWT", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1");
    const token = await accessJWT(env);
    const headers = { "Cf-Access-Jwt-Assertion": token };

    const devicesResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices?status=all", { headers }), env);
    const detailResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1", { headers }), env);
    const runsResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/runs?profile=baseline", { headers }), env);

    expect(devicesResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(runsResponse.status).toBe(200);
    expect(forbiddenVisibilityFields(await devicesResponse.json())).toEqual([]);
    expect(forbiddenVisibilityFields(await detailResponse.json())).toEqual([]);
    expect(forbiddenVisibilityFields(await runsResponse.json())).toEqual([]);
  });

  it("allows UI lifecycle actions only for allowlisted Access actors and returns audit detail", async () => {
    const env = makeEnv();
    env.UI_ADMIN_ACTION_EMAILS = "operator@example.test";
    await addDevice(env, "device-1", "device-secret");
    const headers = {
      "Cf-Access-Jwt-Assertion": await accessJWT(env),
      "Content-Type": "application/json"
    };

    const disableResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "developer offboarded" })
    }), env);
    const enableResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/enable", {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "developer returned" })
    }), env);
    const detailResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1", {
      headers: { "Cf-Access-Jwt-Assertion": await accessJWT(env) }
    }), env);
    const detail = await detailResponse.json() as { lifecycle_events: Array<{ action: string; actor_type: string; actor_id: string; reason: string }> };

    expect(disableResponse.status).toBe(200);
    expect(enableResponse.status).toBe(200);
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeNull();
    expect(env.DB.lifecycleEvents).toHaveLength(2);
    expect(detail.lifecycle_events).toHaveLength(2);
    expect(detail.lifecycle_events.find((event) => event.action === "enable")).toMatchObject({
      action: "enable",
      actor_type: "ui",
      actor_id: "operator@example.test",
      reason: "developer returned"
    });
    expect(forbiddenVisibilityFields(detail)).toEqual([]);
  });

  it("rejects UI lifecycle actions without allowlist, allowed actor, or reason", async () => {
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");
    const token = await accessJWT(env);

    const unconfigured = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": token },
      body: JSON.stringify({ reason: "developer offboarded" })
    }), env);
    env.UI_ADMIN_ACTION_DOMAINS = "example.org";
    const forbidden = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": token },
      body: JSON.stringify({ reason: "developer offboarded" })
    }), env);
    env.UI_ADMIN_ACTION_DOMAINS = "example.test";
    const missingReason = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": token },
      body: JSON.stringify({})
    }), env);
    const adminTokenOnly = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/disable", {
      method: "POST",
      headers: { "X-Hive-Admin-Token": env.ADMIN_TOKEN },
      body: JSON.stringify({ reason: "developer offboarded" })
    }), env);

    expect(unconfigured.status).toBe(403);
    expect(await unconfigured.json()).toEqual({ error: "ui_admin_actions_not_configured" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "ui_admin_action_forbidden" });
    expect(missingReason.status).toBe(400);
    expect(await missingReason.json()).toEqual({ error: "missing_reason" });
    expect(adminTokenOnly.status).toBe(403);
    expect(await adminTokenOnly.json()).toEqual({ error: "missing_access_jwt" });
    expect(env.DB.lifecycleEvents).toHaveLength(0);
  });

  it("returns UI health with configurable baseline stale and weekend grace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T15:00:00.000Z"));
    const env = makeEnv();
    env.HEALTH_PROFILE = "baseline";
    env.HEALTH_EXPECTED_CADENCE_HOURS = "6";
    env.HEALTH_STALE_HOURS = "24";
    env.HEALTH_WEEKEND_GRACE_HOURS = "72";
    await ingestSummary(env, "device-healthy", "healthy-secret", "run-healthy", "baseline", "complete");
    await ingestSummary(env, "device-weekend", "weekend-secret", "run-weekend", "baseline", "complete");
    await ingestSummary(env, "device-stale", "stale-secret", "run-stale", "baseline", "complete");
    await ingestSummary(env, "device-attention", "attention-secret", "run-attention", "baseline", "partial");
    await addDevice(env, "device-unknown", "unknown-secret");
    await ingestSummary(env, "device-disabled", "disabled-secret", "run-disabled", "baseline", "complete");
    env.DB.devices.get("device-disabled")!.disabled_at = "2026-05-25T10:00:00.000Z";
    setRunReceivedAt(env, "run-healthy", "2026-05-25T13:00:00.000Z");
    setRunReceivedAt(env, "run-weekend", "2026-05-22T17:00:00.000Z");
    setRunReceivedAt(env, "run-stale", "2026-05-20T12:00:00.000Z");
    setRunReceivedAt(env, "run-attention", "2026-05-25T14:00:00.000Z");
    const token = await accessJWT(env);

    const response = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/health", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);
    const body = await response.json() as {
      config: { profile: string; expected_cadence_hours: number; stale_hours: number; weekend_grace_hours: number };
      counts: { healthy: number; stale: number; attention: number; unknown: number; total: number };
      devices: Array<{ device_id: string; health: string; reason: string; stale_after_hours: number }>;
    };
    const healthByDevice = Object.fromEntries(body.devices.map((device) => [device.device_id, device]));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.config).toEqual({
      profile: "baseline",
      expected_cadence_hours: 6,
      stale_hours: 24,
      weekend_grace_hours: 72
    });
    expect(body.counts).toEqual({ healthy: 2, stale: 1, attention: 1, unknown: 1, total: 5 });
    expect(healthByDevice["device-healthy"]).toMatchObject({ health: "healthy", reason: "latest_complete_run_recent", stale_after_hours: 24 });
    expect(healthByDevice["device-weekend"]).toMatchObject({ health: "healthy", reason: "latest_complete_run_within_weekend_grace", stale_after_hours: 72 });
    expect(healthByDevice["device-stale"]).toMatchObject({ health: "stale", reason: "latest_complete_run_too_old", stale_after_hours: 72 });
    expect(healthByDevice["device-attention"]).toMatchObject({ health: "attention", reason: "latest_run_not_complete" });
    expect(healthByDevice["device-unknown"]).toMatchObject({ health: "unknown", reason: "no_monitored_profile_run" });
    expect(healthByDevice["device-disabled"]).toBeUndefined();
    expect(forbiddenVisibilityFields(body)).toEqual([]);
  });

  it("rejects UI admin metadata without a valid Access JWT", async () => {
    const env = makeEnv();

    const missing = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/overview"), env);
    const missingHealth = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/health"), env);
    const wrongAudience = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/overview", {
      headers: { "Cf-Access-Jwt-Assertion": await accessJWT(env, "wrong-audience") }
    }), env);

    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({ error: "missing_access_jwt" });
    expect(missingHealth.status).toBe(403);
    expect(await missingHealth.json()).toEqual({ error: "missing_access_jwt" });
    expect(wrongAudience.status).toBe(403);
    expect(await wrongAudience.json()).toEqual({ error: "invalid_access_jwt" });
  });

  it("runs admin retention dry-run and cleanup without exposing raw object keys", async () => {
    const env = makeEnv();
    env.RETENTION_DAYS = "7";
    env.RETENTION_DELETE_LIMIT = "10";
    await ingestSummary(env, "device-1", "device-secret", "run-old");
    await ingestSummary(env, "device-1", "device-secret", "run-new");
    setRunReceivedAt(env, "run-old", "2026-01-01T00:00:00.000Z");
    const oldObjectKey = env.DB.batchRows().find((batch) => batch.run_id === "run-old")?.object_key;
    expect(oldObjectKey).toBeTruthy();
    expect(env.RAW_BATCHES.objects.has(oldObjectKey!)).toBe(true);

    const dryRunResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/retention/run?dry_run=true", {
      method: "POST",
      headers: adminHeaders(env)
    }), env);
    const dryRunBody = await dryRunResponse.json() as { batches: { candidates: number; deleted: number }; runs: { deleted: number } };

    expect(dryRunResponse.status).toBe(200);
    expect(dryRunBody.batches).toMatchObject({ candidates: 1, deleted: 0 });
    expect(dryRunBody.runs.deleted).toBe(0);
    expect(env.RAW_BATCHES.objects.has(oldObjectKey!)).toBe(true);
    expect(forbiddenVisibilityFields(dryRunBody)).toEqual([]);

    const cleanupResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/retention/run", {
      method: "POST",
      headers: adminHeaders(env)
    }), env);
    const cleanupBody = await cleanupResponse.json() as { batches: { deleted: number }; raw_objects: { deleted: number; delete_errors: number }; runs: { deleted: number } };

    expect(cleanupResponse.status).toBe(200);
    expect(cleanupBody.batches.deleted).toBe(1);
    expect(cleanupBody.raw_objects).toMatchObject({ deleted: 1, delete_errors: 0 });
    expect(cleanupBody.runs.deleted).toBe(1);
    expect(env.RAW_BATCHES.objects.has(oldObjectKey!)).toBe(false);
    expect(env.DB.batchRows().map((batch) => batch.run_id)).toEqual(["run-new"]);
    expect(env.DB.runRows().map((run) => run.run_id)).toEqual(["run-new"]);
    expect(forbiddenVisibilityFields(cleanupBody)).toEqual([]);
  });

  it("rejects retention cleanup without the admin token", async () => {
    const env = makeEnv();

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/retention/run", {
      method: "POST",
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "access-secret"
      }
    }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_admin_token" });
  });

  it("keeps token-based admin routes separate from browser UI routes", async () => {
    const env = makeEnv();
    const token = await accessJWT(env);

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/overview", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_admin_token" });
  });

  it("lists active and disabled devices with last-run metadata only", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1", "baseline", "complete");
    await ingestSummary(env, "device-2", "device-secret-2", "run-2", "full", "partial");
    env.DB.devices.get("device-2")!.disabled_at = "2026-05-26T00:00:00.000Z";

    const activeResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices", {
      headers: adminHeaders(env)
    }), env);
    const activeBody = await activeResponse.json() as { devices: Array<{ device_id: string; last_run: { run_id: string; profile: string; status: string } }> };

    expect(activeResponse.status).toBe(200);
    expect(activeBody.devices.map((device) => device.device_id)).toEqual(["device-1"]);
    expect(activeBody.devices[0].last_run).toMatchObject({ run_id: "run-1", profile: "baseline", status: "complete" });
    expect(forbiddenVisibilityFields(activeBody)).toEqual([]);

    const disabledResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices?status=disabled", {
      headers: adminHeaders(env)
    }), env);
    const disabledBody = await disabledResponse.json() as { devices: Array<{ device_id: string; status: string }> };

    expect(disabledResponse.status).toBe(200);
    expect(disabledBody.devices).toEqual([expect.objectContaining({ device_id: "device-2", status: "disabled" })]);
    expect(forbiddenVisibilityFields(disabledBody)).toEqual([]);
  });

  it("returns a device detail with recent run metadata only", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1");

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices/device-1", {
      headers: adminHeaders(env)
    }), env);
    const body = await response.json() as { device: { device_id: string; run_count: number }; recent_runs: Array<{ run_id: string; batch_count: number; record_count: number }> };

    expect(response.status).toBe(200);
    expect(body.device).toMatchObject({ device_id: "device-1", run_count: 1 });
    expect(body.recent_runs).toEqual([expect.objectContaining({ run_id: "run-1", batch_count: 1, record_count: 2 })]);
    expect(forbiddenVisibilityFields(body)).toEqual([]);
  });

  it("lists runs with metadata filters only", async () => {
    const env = makeEnv();
    await ingestSummary(env, "device-1", "device-secret", "run-1", "baseline", "complete");
    await ingestSummary(env, "device-2", "device-secret-2", "run-2", "full", "partial");

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/runs?device_id=device-2&status=partial&profile=full", {
      headers: adminHeaders(env)
    }), env);
    const body = await response.json() as { runs: Array<{ device_id: string; run_id: string; profile: string; status: string }> };

    expect(response.status).toBe(200);
    expect(body.runs).toEqual([expect.objectContaining({ device_id: "device-2", run_id: "run-2", profile: "full", status: "partial" })]);
    expect(forbiddenVisibilityFields(body)).toEqual([]);
  });

  it("rejects admin visibility without the admin token", async () => {
    const env = makeEnv();

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/overview", {
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "access-secret"
      }
    }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_admin_token" });
  });

  it("rejects admin visibility before token check when Access is invalid", async () => {
    const env = makeEnv();

    const response = await worker.fetch(new Request("https://hive.example.test/v1/admin/devices", {
      headers: {
        "CF-Access-Client-Id": "access-id",
        "CF-Access-Client-Secret": "wrong",
        "X-Hive-Admin-Token": "admin-token"
      }
    }), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_access_token" });
  });
});
