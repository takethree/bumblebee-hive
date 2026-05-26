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
      return (device || null) as T | null;
    }
    return null;
  }

  async run(): Promise<D1Result> {
    if (this.sql.startsWith("INSERT INTO devices")) {
      this.db.devices.set(String(this.values[0]), {
        hmac_key_ciphertext: String(this.values[1]),
        hmac_key_nonce: String(this.values[2])
      });
    } else if (this.sql.startsWith("INSERT INTO batches")) {
      this.db.batches.push(this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO runs")) {
      this.db.runs.push(this.values);
    }
    return { success: true, meta: { duration: 0 } } as D1Result;
  }
}

class MemoryD1 {
  devices = new Map<string, { hmac_key_ciphertext: string; hmac_key_nonce: string }>();
  batches: unknown[][] = [];
  runs: unknown[][] = [];

  prepare(sql: string): MemoryStmt {
    return new MemoryStmt(this, sql);
  }
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function makeEnv(): Env & { RAW_BATCHES: MemoryR2; DB: MemoryD1; NORMALIZE_QUEUE: MemoryQueue } {
  return {
    ACCESS_CLIENT_ID: "access-id",
    ACCESS_CLIENT_SECRET: "access-secret",
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
    hmac_key_nonce: encrypted.nonce
  });
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

  it("rejects body signatures computed over a different gzip payload", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const request = await signedRequest(env, gzipSync("{\"record_type\":\"scan_summary\",\"run_id\":\"run-1\"}\n"), "wrong-key");

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(401);
  });

  it("rejects missing scan summaries", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = JSON.stringify({ record_type: "package", run_id: "run-1", endpoint: { device_id: "device-1" } }) + "\n";
    const request = await signedRequest(env, gzipSync(ndjson), hmacKey);

    const response = await worker.fetch(request, env);

    expect(response.status).toBe(400);
  });
});
