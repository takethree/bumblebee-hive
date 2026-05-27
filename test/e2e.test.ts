import { createServer, IncomingMessage } from "node:http";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import worker, { Env, testInternals } from "../src/index";

const execFile = promisify(execFileCallback);
const here = dirname(fileURLToPath(import.meta.url));

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
    if (this.sql.startsWith("INSERT INTO batches")) {
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

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
    hmac_key_nonce: encrypted.nonce
  });
}

describe("local deployment smoke", () => {
  it("uninstalls generated local files without deleting unrelated content", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const temp = await mkdtemp(join(tmpdir(), "bumblebee-hive-uninstall-"));
    try {
      const installRoot = join(temp, "install");
      const configRoot = join(temp, "config");
      await mkdir(installRoot);
      await mkdir(configRoot);
      await writeFile(join(installRoot, "bumblebee.exe"), "fake");
      await writeFile(join(installRoot, "unrelated.txt"), "keep");
      await writeFile(join(configRoot, "config.json"), "{}");
      await writeFile(join(configRoot, "secrets.clixml"), "<Objs />");
      await writeFile(join(configRoot, "run-baseline.ps1"), "exit 0");
      await writeFile(join(configRoot, "unrelated.txt"), "keep");

      const installer = resolve(here, "..", "scripts", "install-bumblebee.ps1");
      const args = [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", installer,
        "-Uninstall",
        "-SkipSchedule",
        "-InstallRoot", installRoot,
        "-ConfigRoot", configRoot
      ];
      await execFile("powershell", args);
      await execFile("powershell", args);

      expect(await exists(join(installRoot, "bumblebee.exe"))).toBe(false);
      expect(await exists(join(configRoot, "config.json"))).toBe(false);
      expect(await exists(join(configRoot, "secrets.clixml"))).toBe(false);
      expect(await exists(join(configRoot, "run-baseline.ps1"))).toBe(false);
      expect(await readFile(join(installRoot, "unrelated.txt"), "utf8")).toBe("keep");
      expect(await readFile(join(configRoot, "unrelated.txt"), "utf8")).toBe("keep");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("installs Bumblebee and delivers a complete scan through Hive", async () => {
    if (process.env.BUMBLEBEE_E2E !== "1") {
      return;
    }

    const repo = process.env.BUMBLEBEE_REPO || resolve(here, "..", "..", "bumblebee");
    const goExe = process.env.GO_EXE || "go";
    const temp = await mkdtemp(join(tmpdir(), "bumblebee-hive-e2e-"));
    const env = makeEnv();
    await addDevice(env, "device-1", "device-secret");

    const server = createServer(async (req, res) => {
      const body = await readRequestBody(req);
      const response = await worker.fetch(new Request(`http://127.0.0.1/v1/ingest`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
      }), env);
      res.statusCode = response.status;
      response.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });
      res.end(await response.text());
    });

    try {
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("server did not expose a TCP port");
      }
      const hiveBaseUrl = `http://127.0.0.1:${address.port}`;
      const builtExe = join(temp, "bumblebee.exe");
      await execFile(goExe, ["build", "-buildvcs=false", "-o", builtExe, "./cmd/bumblebee"], { cwd: repo });

      const fixture = join(temp, "fixture");
      await mkdir(fixture);
      await writeFile(join(fixture, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", version: "1.0.0" },
          "node_modules/left-pad": { version: "1.3.0" }
        }
      }));

      const installRoot = join(temp, "install");
      const configRoot = join(temp, "config");
      const installer = resolve(here, "..", "scripts", "install-bumblebee.ps1");
      await execFile("powershell", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", installer,
        "-HiveBaseUrl", hiveBaseUrl,
        "-AccessClientId", "access-id",
        "-AccessClientSecret", "access-secret",
        "-SkipDownload",
        "-BumblebeeExePath", builtExe,
        "-SkipEnroll",
        "-DeviceId", "device-1",
        "-HmacKey", "device-secret",
        "-SkipSchedule",
        "-InstallRoot", installRoot,
        "-ConfigRoot", configRoot,
        "-ScanProfile", "project",
        "-ScanRoot", fixture
      ]);

      await execFile("powershell", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", join(configRoot, "run-baseline.ps1")
      ]);

      expect(env.RAW_BATCHES.objects.size).toBeGreaterThan(0);
      expect(env.DB.batches.length).toBeGreaterThan(0);
      expect(env.DB.runs.length).toBe(1);
      const summary = JSON.parse(String(env.DB.runs[0][6])) as { status: string };
      expect(summary.status).toBe("complete");
      const configText = (await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "");
      const config = JSON.parse(configText) as { device_id: string };
      expect(config.device_id).toBe("device-1");
    } finally {
      server.close();
      await rm(temp, { recursive: true, force: true });
    }
  }, 120_000);
});
