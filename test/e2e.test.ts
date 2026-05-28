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

  async get(key: string): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null> {
    const value = this.objects.get(key);
    if (!value) {
      return null;
    }
    return {
      arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
    };
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
    if (this.sql.startsWith("SELECT release_id, source, schema_version, file_count, entry_count, bundle_sha256, published_at FROM catalog_releases")) {
      return (this.db.catalogReleaseRows()
        .filter((release) => release.active === 1)
        .sort((left, right) => right.published_at.localeCompare(left.published_at))[0] || null) as T | null;
    }
    if (this.sql.startsWith("SELECT batch_id, device_id, run_id, received_at, content_encoding, object_key, summary_status FROM batches")) {
      return (this.db.normalizationBatchRow(String(this.values[0])) || null) as T | null;
    }
    if (this.sql.startsWith("SELECT profile, status, scanner_version, received_at FROM runs")) {
      return (this.db.runRows()
        .filter((run) => run.device_id === String(this.values[0]) && run.run_id === String(this.values[1]) && run.status === "complete")
        .sort((left, right) => right.received_at.localeCompare(left.received_at))[0] || null) as T | null;
    }
    if (this.sql.startsWith("SELECT COUNT(*) AS total FROM exposure_findings")) {
      return { total: this.filteredFindingRows().length } as T;
    }
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.startsWith("SELECT release_id, path, sha256, entry_count, content_json FROM catalog_files")) {
      const releaseID = String(this.values[0]);
      return {
        results: this.db.catalogFileRows()
          .filter((file) => file.release_id === releaseID)
          .sort((left, right) => left.path.localeCompare(right.path)) as T[]
      };
    }
    if (this.sql.includes("FROM exposure_findings")) {
      const rows = this.filteredFindingRows();
      if (this.sql.includes("GROUP BY COALESCE(severity")) {
        const counts = new Map<string, number>();
        for (const row of rows) {
          const key = row.severity || "";
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        return { results: [...counts.entries()].map(([value, total]) => ({ value, total })) as T[] };
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
        disabled_at: null,
        environment: String(this.values[4] || "production") as "production" | "test"
      });
    } else if (this.sql.startsWith("INSERT INTO batches")) {
      this.db.batches.push(this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO runs")) {
      const [deviceID, profile, runID] = this.values.map(String);
      this.db.runs = this.db.runs.filter((run) => String(run[0]) !== deviceID || String(run[1]) !== profile || String(run[2]) !== runID);
      this.db.runs.push(this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO catalog_releases")) {
      const releaseID = String(this.values[0]);
      this.db.catalogReleases = this.db.catalogReleases.filter((release) => String(release[0]) !== releaseID);
      this.db.catalogReleases.push(this.values);
    } else if (this.sql.startsWith("DELETE FROM catalog_files")) {
      const releaseID = String(this.values[0]);
      this.db.catalogFiles = this.db.catalogFiles.filter((file) => String(file[0]) !== releaseID);
    } else if (this.sql.startsWith("INSERT INTO catalog_files")) {
      this.db.catalogFiles.push(this.values);
    } else if (this.sql.startsWith("UPDATE catalog_releases SET active = 0")) {
      for (const release of this.db.catalogReleases) {
        release[7] = 0;
      }
    } else if (this.sql.startsWith("UPDATE catalog_releases SET active = 1")) {
      const releaseID = String(this.values[0]);
      for (const release of this.db.catalogReleases) {
        if (String(release[0]) === releaseID) {
          release[7] = 1;
        }
      }
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO normalization_jobs")) {
      this.db.normalizationJobs.set(String(this.values[0]), this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO inventory_records")) {
      const key = `${this.values[0]}|${this.values[1]}|${this.values[2]}`;
      this.db.inventoryRecords.set(key, this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO exposure_findings")) {
      const key = `${this.values[0]}|${this.values[1]}|${this.values[2]}`;
      this.db.exposureFindings.set(key, this.values);
    }
    return { success: true, meta: { duration: 0 } } as D1Result;
  }

  private page<T>(rows: T[]): T[] {
    const lastValue = this.values.at(-1);
    const previousValue = this.values.at(-2);
    const hasBoundPage = typeof lastValue === "number" && typeof previousValue === "number";
    const offset = hasBoundPage ? lastValue : 0;
    const limit = hasBoundPage ? previousValue : rows.length;
    return rows.slice(offset, offset + limit);
  }

  private filteredFindingRows(): ReturnType<MemoryD1["findingRows"]> {
    let rows = this.filteredRowsByEnvironment(this.db.findingRows());
    let valueIndex = this.sql.includes("env_d.environment = ?") ? 1 : 0;
    for (const column of ["device_id", "severity", "catalog_id", "ecosystem", "profile", "run_id"]) {
      if (this.sql.includes(`${column} = ?`)) {
        const value = String(this.values[valueIndex++]);
        rows = rows.filter((row) => String(row[column as keyof typeof row]) === value);
      }
    }
    return rows;
  }

  private filteredRowsByEnvironment<T extends { device_id: string }>(rows: T[]): T[] {
    if (!this.sql.includes("env_d.environment = ?")) {
      return rows;
    }
    const environment = String(this.values[0]);
    return rows.filter((row) => (this.db.devices.get(row.device_id)?.environment || "production") === environment);
  }
}

class MemoryD1 {
  devices = new Map<string, { hmac_key_ciphertext: string; hmac_key_nonce: string; created_at?: string; disabled_at?: string | null; environment: "production" | "test" }>();
  batches: unknown[][] = [];
  runs: unknown[][] = [];
  catalogReleases: unknown[][] = [];
  catalogFiles: unknown[][] = [];
  normalizationJobs = new Map<string, unknown[]>();
  inventoryRecords = new Map<string, unknown[]>();
  exposureFindings = new Map<string, unknown[]>();

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

  normalizationBatchRow(batchID: string): {
    batch_id: string;
    device_id: string;
    run_id: string;
    received_at: string;
    content_encoding: string | null;
    object_key: string;
    summary_status: string | null;
  } | null {
    const batch = this.batches.find((row) => String(row[0]) === batchID);
    if (!batch) {
      return null;
    }
    return {
      batch_id: String(batch[0]),
      device_id: String(batch[1]),
      run_id: String(batch[2]),
      received_at: String(batch[3]),
      content_encoding: batch[4] === null || batch[4] === undefined ? null : String(batch[4]),
      object_key: String(batch[5]),
      summary_status: batch[8] === null || batch[8] === undefined ? null : String(batch[8])
    };
  }

  runRows(): Array<{ device_id: string; profile: string; run_id: string; status: string; scanner_version: string | null; received_at: string; summary_json: string }> {
    return this.runs.map((run) => ({
      device_id: String(run[0]),
      profile: String(run[1]),
      run_id: String(run[2]),
      status: String(run[3]),
      scanner_version: run[4] === null || run[4] === undefined ? null : String(run[4]),
      received_at: String(run[5]),
      summary_json: String(run[6])
    }));
  }

  catalogReleaseRows(): Array<{ release_id: string; source: string | null; schema_version: string; file_count: number; entry_count: number; bundle_sha256: string; published_at: string; active: number }> {
    return this.catalogReleases.map((release) => ({
      release_id: String(release[0]),
      source: release[1] === null || release[1] === undefined ? null : String(release[1]),
      schema_version: String(release[2]),
      file_count: Number(release[3]),
      entry_count: Number(release[4]),
      bundle_sha256: String(release[5]),
      published_at: String(release[6]),
      active: Number(release[7])
    }));
  }

  catalogFileRows(): Array<{ release_id: string; path: string; sha256: string; entry_count: number; content_json: string }> {
    return this.catalogFiles.map((file) => ({
      release_id: String(file[0]),
      path: String(file[1]),
      sha256: String(file[2]),
      entry_count: Number(file[3]),
      content_json: String(file[4])
    }));
  }

  findingRows(): Array<{
    device_id: string;
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
  }> {
    return [...this.exposureFindings.values()].map((row) => ({
      device_id: String(row[0]),
      run_id: String(row[1]),
      record_id: String(row[2]),
      profile: String(row[3]),
      finding_type: String(row[4]),
      severity: row[5] === null || row[5] === undefined ? null : String(row[5]),
      catalog_id: String(row[6]),
      catalog_name: row[7] === null || row[7] === undefined ? null : String(row[7]),
      ecosystem: String(row[8]),
      package_name: String(row[9]),
      normalized_name: String(row[10]),
      version: row[11] === null || row[11] === undefined ? null : String(row[11]),
      root_kind: row[12] === null || row[12] === undefined ? null : String(row[12]),
      source_type: row[13] === null || row[13] === undefined ? null : String(row[13]),
      confidence: row[14] === null || row[14] === undefined ? null : String(row[14]),
      evidence: row[15] === null || row[15] === undefined ? null : String(row[15]),
      received_at: String(row[17])
    }));
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

function adminHeaders(env: Env): HeadersInit {
  return {
    "CF-Access-Client-Id": env.ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.ACCESS_CLIENT_SECRET,
    "X-Hive-Admin-Token": env.ADMIN_TOKEN
  };
}

async function addDevice(env: Env & { DB: MemoryD1 }, deviceID: string, hmacKey: string, environment: "production" | "test" = "production"): Promise<void> {
  const encrypted = await testInternals.encryptSecret(env, hmacKey);
  env.DB.devices.set(deviceID, {
    hmac_key_ciphertext: encrypted.ciphertext,
    hmac_key_nonce: encrypted.nonce,
    environment
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
      await writeFile(join(configRoot, "secrets.json"), "{}");
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
      expect(await exists(join(configRoot, "secrets.json"))).toBe(false);
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

    const server = createServer(async (req, res) => {
      const body = await readRequestBody(req);
      const response = await worker.fetch(new Request(`http://127.0.0.1${req.url || "/"}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.byteLength === 0
          ? undefined
          : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
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
      const cacheRoot = join(temp, "cache");
      const installer = resolve(here, "..", "scripts", "install-bumblebee.ps1");
      await execFile("powershell", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", installer,
        "-HiveBaseUrl", hiveBaseUrl,
        "-AccessClientId", "access-id",
        "-AccessClientSecret", "access-secret",
        "-EnrollmentToken", "enroll-token",
        "-SkipDownload",
        "-BumblebeeExePath", builtExe,
        "-SkipSchedule",
        "-InstallRoot", installRoot,
        "-ConfigRoot", configRoot,
        "-CacheRoot", cacheRoot,
        "-Environment", "test",
        "-ScanProfile", "project",
        "-ScanRoot", fixture
      ]);

      const firstConfigText = (await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "");
      const firstConfig = JSON.parse(firstConfigText) as { base_url: string; ingest_path: string; device_id: string; environment: string; scan_profile: string; scan_roots: string[] };
      expect(firstConfig.base_url).toBe(hiveBaseUrl);
      expect(firstConfig.ingest_path).toBe("/v1/ingest");
      expect(firstConfig.device_id).toBeTruthy();
      expect(firstConfig.environment).toBe("test");
      expect(firstConfig.scan_profile).toBe("project");
      expect(firstConfig.scan_roots).toEqual([fixture]);
      expect(env.DB.devices.size).toBe(1);
      expect([...env.DB.devices.values()][0].environment).toBe("test");
      expect(await exists(join(configRoot, "secrets.json"))).toBe(true);
      expect(await exists(join(configRoot, "secrets.clixml"))).toBe(false);
      expect(await exists(cacheRoot)).toBe(true);

      await execFile("powershell", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", installer,
        "-HiveBaseUrl", hiveBaseUrl,
        "-AccessClientId", "access-id",
        "-AccessClientSecret", "access-secret",
        "-SkipDownload",
        "-BumblebeeExePath", builtExe,
        "-SkipSchedule",
        "-InstallRoot", installRoot,
        "-ConfigRoot", configRoot,
        "-CacheRoot", cacheRoot,
        "-Environment", "test",
        "-ScanProfile", "project",
        "-ScanRoot", fixture
      ]);
      const reusedConfig = JSON.parse((await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "")) as { device_id: string; environment: string };
      expect(reusedConfig.device_id).toBe(firstConfig.device_id);
      expect(reusedConfig.environment).toBe("test");
      expect(env.DB.devices.size).toBe(1);

      const runScriptText = await readFile(join(configRoot, "run-baseline.ps1"), "utf8");
      expect(runScriptText).toContain("\"hive\", \"run\"");
      expect(runScriptText).toContain("--config-dir");
      expect(runScriptText).toContain("--cache-dir");

      const catalogContent = JSON.stringify({ schema_version: "0.1.0", entries: [] });
      const publish = await worker.fetch(new Request("https://hive.example.test/v1/admin/catalog/current", {
        method: "POST",
        headers: { ...adminHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "installer-e2e",
          files: [{ path: "empty.json", content: catalogContent }]
        })
      }), env);
      expect(publish.status).toBe(201);

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
    } finally {
      server.close();
      await rm(temp, { recursive: true, force: true });
    }
  }, 120_000);

  it("publishes a Hive catalog, runs Bumblebee hive run, and exposes the resulting finding", async () => {
    if (process.env.BUMBLEBEE_E2E !== "1") {
      return;
    }

    const repo = process.env.BUMBLEBEE_REPO || resolve(here, "..", "..", "bumblebee");
    const goExe = process.env.GO_EXE || "go";
    const temp = await mkdtemp(join(tmpdir(), "bumblebee-hive-catalog-e2e-"));
    const env = makeEnv();

    const server = createServer(async (req, res) => {
      const body = await readRequestBody(req);
      const response = await worker.fetch(new Request(`http://127.0.0.1${req.url || "/"}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.byteLength === 0
          ? undefined
          : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
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

      const configRoot = join(temp, "config");
      const cacheRoot = join(temp, "cache");
      await execFile(builtExe, [
        "hive", "join",
        "--base-url", hiveBaseUrl,
        "--config-dir", configRoot,
        "--cache-dir", cacheRoot,
        "--environment", "test",
        "--scan-profile", "project",
        "--root", fixture
      ], {
        env: {
          ...process.env,
          BUMBLEBEE_ACCESS_CLIENT_ID: env.ACCESS_CLIENT_ID,
          BUMBLEBEE_ACCESS_CLIENT_SECRET: env.ACCESS_CLIENT_SECRET,
          BUMBLEBEE_ENROLLMENT_TOKEN: env.ENROLLMENT_TOKEN
        }
      });
      const firstConfig = JSON.parse((await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "")) as { device_id: string; environment: string };
      expect(firstConfig.environment).toBe("test");
      expect(env.DB.devices.size).toBe(1);

      await execFile(builtExe, [
        "hive", "join",
        "--base-url", hiveBaseUrl,
        "--config-dir", configRoot,
        "--cache-dir", cacheRoot
      ], {
        env: {
          ...process.env,
          BUMBLEBEE_ACCESS_CLIENT_ID: env.ACCESS_CLIENT_ID,
          BUMBLEBEE_ACCESS_CLIENT_SECRET: env.ACCESS_CLIENT_SECRET,
          BUMBLEBEE_ENROLLMENT_TOKEN: ""
        }
      });
      const reusedConfig = JSON.parse((await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "")) as { device_id: string; environment: string };
      expect(reusedConfig.device_id).toBe(firstConfig.device_id);
      expect(reusedConfig.environment).toBe("test");
      expect(env.DB.devices.size).toBe(1);

      await execFile(builtExe, [
        "hive", "join",
        "--base-url", hiveBaseUrl,
        "--config-dir", configRoot,
        "--cache-dir", cacheRoot,
        "--new-device"
      ], {
        env: {
          ...process.env,
          BUMBLEBEE_ACCESS_CLIENT_ID: env.ACCESS_CLIENT_ID,
          BUMBLEBEE_ACCESS_CLIENT_SECRET: env.ACCESS_CLIENT_SECRET,
          BUMBLEBEE_ENROLLMENT_TOKEN: env.ENROLLMENT_TOKEN
        }
      });
      const newDeviceConfig = JSON.parse((await readFile(join(configRoot, "config.json"), "utf8")).replace(/^\uFEFF/, "")) as { device_id: string; environment: string };
      expect(newDeviceConfig.device_id).not.toBe(firstConfig.device_id);
      expect(newDeviceConfig.environment).toBe("test");
      expect(env.DB.devices.size).toBe(2);

      const catalogContent = JSON.stringify({
        schema_version: "0.1.0",
        entries: [{
          id: "advisory-left-pad",
          name: "left-pad test advisory",
          ecosystem: "npm",
          package: "left-pad",
          versions: ["1.3.0"],
          severity: "critical"
        }]
      });
      const publish = await worker.fetch(new Request("https://hive.example.test/v1/admin/catalog/current", {
        method: "POST",
        headers: { ...adminHeaders(env), "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "e2e-test",
          files: [{ path: "left-pad.json", content: catalogContent }]
        })
      }), env);
      expect(publish.status).toBe(201);

      await execFile(builtExe, [
        "hive", "catalog", "sync",
        "--config-dir", configRoot,
        "--cache-dir", cacheRoot
      ]);

      await execFile(builtExe, [
        "hive", "run",
        "--config-dir", configRoot,
        "--cache-dir", cacheRoot,
        "--max-duration", "30s"
      ]);

      expect(env.NORMALIZE_QUEUE.messages.length).toBeGreaterThan(0);
      for (const message of env.NORMALIZE_QUEUE.messages) {
        await testInternals.normalizeQueuedBatch(env, message as { device_id: string; run_id: string; batch_id: string });
      }

      const productionFindingsResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/findings?catalog_id=advisory-left-pad&limit=10&offset=0", {
        headers: adminHeaders(env)
      }), env);
      const productionFindingsBody = await productionFindingsResponse.json() as {
        counts: { total: number };
      };
      const findingsResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/findings?environment=test&catalog_id=advisory-left-pad&limit=10&offset=0", {
        headers: adminHeaders(env)
      }), env);
      const findingsBody = await findingsResponse.json() as {
        counts: { total: number; severities: Record<string, number> };
        findings: Array<{ catalog_id: string; normalized_name: string; version: string; severity: string }>;
      };
      const summary = JSON.parse(env.DB.runRows()[0].summary_json) as { status: string; findings_emitted: number; catalog?: { release_id: string; source: string } };

      expect(productionFindingsResponse.status).toBe(200);
      expect(productionFindingsBody.counts.total).toBe(0);
      expect(findingsResponse.status).toBe(200);
      expect(findingsBody.counts.total).toBe(1);
      expect(findingsBody.counts.severities.critical).toBe(1);
      expect(findingsBody.findings).toEqual([expect.objectContaining({
        catalog_id: "advisory-left-pad",
        normalized_name: "left-pad",
        version: "1.3.0",
        severity: "critical"
      })]);
      expect(summary.status).toBe("complete");
      expect(summary.findings_emitted).toBe(1);
      expect(summary.catalog).toMatchObject({ source: "e2e-test" });
    } finally {
      server.close();
      await rm(temp, { recursive: true, force: true });
    }
  }, 120_000);
});
