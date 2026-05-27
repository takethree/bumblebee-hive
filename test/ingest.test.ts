import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import worker, { Env, testInternals } from "../src/index";

class MemoryR2 {
  objects = new Map<string, Uint8Array>();

  async put(key: string, value: Uint8Array): Promise<void> {
    this.objects.set(key, value);
  }
}

class MemoryQueue {
  messages: unknown[] = [];

  async send(message: unknown): Promise<void> {
    this.messages.push(message);
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
    if (this.sql.includes("FROM devices d")) {
      let rows = this.db.adminDeviceRows();
      if (this.sql.includes("WHERE d.disabled_at IS NULL")) {
        rows = rows.filter((row) => !row.disabled_at);
      } else if (this.sql.includes("WHERE d.disabled_at IS NOT NULL")) {
        rows = rows.filter((row) => row.disabled_at);
      }
      return { results: this.page(rows) as T[] };
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
    } else if (this.sql.startsWith("UPDATE devices SET disabled_at")) {
      const device = this.db.devices.get(String(this.values[1]));
      if (device && !device.disabled_at) {
        device.disabled_at = String(this.values[0]);
        return { success: true, meta: { duration: 0, changes: 1 } } as D1Result;
      }
      return { success: true, meta: { duration: 0, changes: 0 } } as D1Result;
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

  prepare(sql: string): MemoryStmt {
    return new MemoryStmt(this, sql);
  }

  batchRows(): Array<{ device_id: string; run_id: string; received_at: string; record_count: number }> {
    return this.batches.map((batch) => ({
      device_id: String(batch[1]),
      run_id: String(batch[2]),
      received_at: String(batch[3]),
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
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function makeEnv(): Env & { RAW_BATCHES: MemoryR2; DB: MemoryD1; NORMALIZE_QUEUE: MemoryQueue } {
  return {
    ACCESS_CLIENT_ID: "access-id",
    ACCESS_CLIENT_SECRET: "access-secret",
    ADMIN_TOKEN: "admin-token",
    ENROLLMENT_TOKEN: "enroll-token",
    HIVE_KEY_ENCRYPTION_KEY: base64url(crypto.getRandomValues(new Uint8Array(32))),
    RAW_BATCHES: new MemoryR2() as unknown as MemoryR2 & R2Bucket,
    DB: new MemoryD1() as unknown as MemoryD1 & D1Database,
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

describe("bumblebee hive worker", () => {
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
    expect(env.DB.devices.get("device-1")?.disabled_at).toBeTruthy();

    const request = await signedRequest(env, gzipSync("{\"record_type\":\"scan_summary\",\"run_id\":\"run-1\"}\n"), hmacKey);
    const ingestResponse = await worker.fetch(request, env);

    expect(ingestResponse.status).toBe(401);
    expect(await ingestResponse.json()).toEqual({ error: "unknown_device" });
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
