import { gzipSync } from "node:zlib";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { Env, testInternals } from "../src/index";

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
    if (path === "/admin/app.js") {
      return new Response("app", {
        headers: { "Content-Type": "application/javascript; charset=utf-8" }
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
    if (this.sql.startsWith("SELECT batch_id, device_id, run_id, received_at, content_encoding, object_key, summary_status FROM batches")) {
      return (this.db.normalizationBatchRow(String(this.values[0])) || null) as T | null;
    }
    if (this.sql.startsWith("SELECT profile, status, scanner_version, received_at FROM runs")) {
      return (this.db.runRows()
        .filter((run) => run.device_id === String(this.values[0]) && run.run_id === String(this.values[1]) && run.status === "complete")
        .sort((left, right) => right.received_at.localeCompare(left.received_at))[0] || null) as T | null;
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
    if (this.sql.includes("FROM inventory_current")) {
      let rows = this.db.currentRows();
      let valueIndex = 0;
      if (this.sql.includes("device_id = ?")) {
        const deviceID = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.device_id === deviceID);
      }
      if (this.sql.includes("ecosystem = ?")) {
        const ecosystem = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.ecosystem === ecosystem);
      }
      if (this.sql.includes("profile = ?")) {
        const profile = String(this.values[valueIndex++]);
        rows = rows.filter((row) => row.profile === profile);
      }
      if (this.sql.includes("normalized_name LIKE ?")) {
        const query = String(this.values[valueIndex++]).replace(/^%|%$/g, "").toLowerCase();
        valueIndex++;
        rows = rows.filter((row) =>
          row.normalized_name.toLowerCase().includes(query) ||
          row.package_name.toLowerCase().includes(query)
        );
      }
      if (this.sql.includes("WITH family_page")) {
        const familyRows = this.page(this.packageFamilyRows(rows));
        const familyKeys = new Set(familyRows.map((row) => this.packageFamilyKey(row)));
        return { results: this.packageSummaryRows(rows).filter((row) => familyKeys.has(this.packageFamilyKey(row))) as T[] };
      }
      if (this.sql.includes("GROUP BY device_id, profile, ecosystem, normalized_name, version")) {
        return { results: this.page(this.packageSummaryRows(rows)) as T[] };
      }
      if (this.sql.includes("GROUP BY device_id, profile, ecosystem, normalized_name")) {
        return { results: this.page(this.packageFamilyRows(rows)) as T[] };
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
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO normalization_jobs")) {
      this.db.normalizationJobs.set(String(this.values[0]), this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO inventory_records")) {
      const key = `${this.values[0]}|${this.values[1]}|${this.values[2]}`;
      this.db.inventoryRecords.set(key, this.values);
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO exposure_findings")) {
      const key = `${this.values[0]}|${this.values[1]}|${this.values[2]}`;
      this.db.exposureFindings.set(key, this.values);
    } else if (this.sql.startsWith("DELETE FROM inventory_current")) {
      const deviceID = String(this.values[0]);
      const profile = String(this.values[1]);
      const before = this.db.inventoryCurrent.size;
      for (const [key, row] of [...this.db.inventoryCurrent.entries()]) {
        if (String(row[0]) === deviceID && String(row[1]) === profile) {
          this.db.inventoryCurrent.delete(key);
        }
      }
      return { success: true, meta: { duration: 0, changes: before - this.db.inventoryCurrent.size } } as D1Result;
    } else if (this.sql.startsWith("INSERT OR REPLACE INTO inventory_current")) {
      const deviceID = String(this.values[0]);
      const runID = String(this.values[1]);
      const profile = String(this.values[2]);
      let changes = 0;
      for (const record of this.db.inventoryRecordRows()) {
        if (record.device_id === deviceID && record.run_id === runID && record.profile === profile && record.record_type === "package") {
          const row = [
            record.device_id,
            record.profile,
            record.record_id,
            record.run_id,
            record.schema_version,
            record.scanner_version,
            record.scan_time,
            record.ecosystem,
            record.package_name,
            record.normalized_name,
            record.version,
            record.root_kind,
            record.install_scope,
            record.package_manager,
            record.source_type,
            record.direct_dependency,
            record.has_lifecycle_scripts,
            record.confidence,
            record.requested_spec,
            record.server_name,
            record.received_at
          ];
          this.db.inventoryCurrent.set(`${record.device_id}|${record.profile}|${record.record_id}`, row);
          changes++;
        }
      }
      return { success: true, meta: { duration: 0, changes } } as D1Result;
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
    const typed = row as { last_run_received_at?: string | null; latest_observed_at?: string | null; created_at?: string; received_at?: string };
    return typed.last_run_received_at || typed.latest_observed_at || typed.received_at || typed.created_at || "";
  }

  private packageSummaryRows(rows: ReturnType<MemoryD1["currentRows"]>): Array<Record<string, unknown>> {
    const groups = new Map<string, {
      device_id: string;
      profile: string;
      ecosystem: string;
      package_name: string;
      normalized_name: string;
      version: string | null;
      occurrence_count: number;
      package_managers: Set<string>;
      source_types: Set<string>;
      root_kinds: Set<string>;
      direct_dependency_present: number | null;
      has_lifecycle_scripts: number;
      latest_observed_at: string;
      latest_run_id: string | null;
    }>();
    for (const row of rows) {
      const key = JSON.stringify([row.device_id, row.profile, row.ecosystem, row.normalized_name, row.version]);
      let group = groups.get(key);
      if (!group) {
        group = {
          device_id: row.device_id,
          profile: row.profile,
          ecosystem: row.ecosystem,
          package_name: row.package_name,
          normalized_name: row.normalized_name,
          version: row.version,
          occurrence_count: 0,
          package_managers: new Set<string>(),
          source_types: new Set<string>(),
          root_kinds: new Set<string>(),
          direct_dependency_present: null,
          has_lifecycle_scripts: 0,
          latest_observed_at: row.observed_at,
          latest_run_id: row.run_id
        };
        groups.set(key, group);
      }
      group.occurrence_count++;
      if (row.package_manager) group.package_managers.add(row.package_manager);
      if (row.source_type) group.source_types.add(row.source_type);
      if (row.root_kind) group.root_kinds.add(row.root_kind);
      if (row.direct_dependency !== null) {
        group.direct_dependency_present = group.direct_dependency_present === 1 || row.direct_dependency === 1 ? 1 : 0;
      }
      if (row.has_lifecycle_scripts) group.has_lifecycle_scripts = 1;
      if (row.observed_at >= group.latest_observed_at) {
        group.latest_observed_at = row.observed_at;
        group.latest_run_id = row.run_id;
      }
    }
    return [...groups.values()].map((group) => ({
      ...group,
      package_managers: [...group.package_managers].sort().join(","),
      source_types: [...group.source_types].sort().join(","),
      root_kinds: [...group.root_kinds].sort().join(",")
    }));
  }

  private packageFamilyRows(rows: ReturnType<MemoryD1["currentRows"]>): Array<Record<string, unknown>> {
    const groups = new Map<string, {
      device_id: string;
      profile: string;
      ecosystem: string;
      package_name: string;
      normalized_name: string;
      versions: Set<string>;
      total_occurrence_count: number;
      package_managers: Set<string>;
      source_types: Set<string>;
      root_kinds: Set<string>;
      direct_dependency_present: number | null;
      has_lifecycle_scripts: number;
      latest_observed_at: string;
      latest_run_id: string | null;
    }>();
    for (const row of rows) {
      const key = this.packageFamilyKey(row);
      let group = groups.get(key);
      if (!group) {
        group = {
          device_id: row.device_id,
          profile: row.profile,
          ecosystem: row.ecosystem,
          package_name: row.package_name,
          normalized_name: row.normalized_name,
          versions: new Set<string>(),
          total_occurrence_count: 0,
          package_managers: new Set<string>(),
          source_types: new Set<string>(),
          root_kinds: new Set<string>(),
          direct_dependency_present: null,
          has_lifecycle_scripts: 0,
          latest_observed_at: row.observed_at,
          latest_run_id: row.run_id
        };
        groups.set(key, group);
      }
      group.versions.add(row.version || "");
      group.total_occurrence_count++;
      if (row.package_manager) group.package_managers.add(row.package_manager);
      if (row.source_type) group.source_types.add(row.source_type);
      if (row.root_kind) group.root_kinds.add(row.root_kind);
      if (row.direct_dependency !== null) {
        group.direct_dependency_present = group.direct_dependency_present === 1 || row.direct_dependency === 1 ? 1 : 0;
      }
      if (row.has_lifecycle_scripts) group.has_lifecycle_scripts = 1;
      if (row.observed_at >= group.latest_observed_at) {
        group.latest_observed_at = row.observed_at;
        group.latest_run_id = row.run_id;
      }
    }
    return [...groups.values()].map((group) => ({
      device_id: group.device_id,
      profile: group.profile,
      ecosystem: group.ecosystem,
      package_name: group.package_name,
      normalized_name: group.normalized_name,
      version_count: group.versions.size,
      total_occurrence_count: group.total_occurrence_count,
      package_managers: [...group.package_managers].sort().join(","),
      source_types: [...group.source_types].sort().join(","),
      root_kinds: [...group.root_kinds].sort().join(","),
      direct_dependency_present: group.direct_dependency_present,
      has_lifecycle_scripts: group.has_lifecycle_scripts,
      latest_observed_at: group.latest_observed_at,
      latest_run_id: group.latest_run_id
    }));
  }

  private packageFamilyKey(row: { device_id?: unknown; profile?: unknown; ecosystem?: unknown; normalized_name?: unknown }): string {
    return [row.device_id, row.profile, row.ecosystem, row.normalized_name].map(String).join("|");
  }
}

class MemoryD1 {
  devices = new Map<string, { hmac_key_ciphertext: string; hmac_key_nonce: string; created_at: string; disabled_at: string | null }>();
  batches: unknown[][] = [];
  runs: unknown[][] = [];
  lifecycleEvents: unknown[][] = [];
  normalizationJobs = new Map<string, unknown[]>();
  inventoryRecords = new Map<string, unknown[]>();
  inventoryCurrent = new Map<string, unknown[]>();
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

  inventoryRecordRows(): Array<{
    device_id: string;
    run_id: string;
    record_id: string;
    record_type: string;
    profile: string;
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
    received_at: string;
  }> {
    return [...this.inventoryRecords.values()].map((row) => ({
      device_id: String(row[0]),
      run_id: String(row[1]),
      record_id: String(row[2]),
      record_type: String(row[3]),
      profile: String(row[4]),
      schema_version: row[5] === null || row[5] === undefined ? null : String(row[5]),
      scanner_version: row[6] === null || row[6] === undefined ? null : String(row[6]),
      scan_time: row[7] === null || row[7] === undefined ? null : String(row[7]),
      ecosystem: String(row[8]),
      package_name: String(row[9]),
      normalized_name: String(row[10]),
      version: row[11] === null || row[11] === undefined ? null : String(row[11]),
      root_kind: row[12] === null || row[12] === undefined ? null : String(row[12]),
      install_scope: row[13] === null || row[13] === undefined ? null : String(row[13]),
      package_manager: row[14] === null || row[14] === undefined ? null : String(row[14]),
      source_type: row[15] === null || row[15] === undefined ? null : String(row[15]),
      direct_dependency: row[16] === null || row[16] === undefined ? null : Number(row[16]),
      has_lifecycle_scripts: Number(row[17] || 0),
      confidence: row[18] === null || row[18] === undefined ? null : String(row[18]),
      requested_spec: row[19] === null || row[19] === undefined ? null : String(row[19]),
      server_name: row[20] === null || row[20] === undefined ? null : String(row[20]),
      received_at: String(row[27])
    }));
  }

  currentRows(): Array<{
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
  }> {
    return [...this.inventoryCurrent.values()].map((row) => ({
      device_id: String(row[0]),
      profile: String(row[1]),
      record_id: String(row[2]),
      run_id: String(row[3]),
      schema_version: row[4] === null || row[4] === undefined ? null : String(row[4]),
      scanner_version: row[5] === null || row[5] === undefined ? null : String(row[5]),
      scan_time: row[6] === null || row[6] === undefined ? null : String(row[6]),
      ecosystem: String(row[7]),
      package_name: String(row[8]),
      normalized_name: String(row[9]),
      version: row[10] === null || row[10] === undefined ? null : String(row[10]),
      root_kind: row[11] === null || row[11] === undefined ? null : String(row[11]),
      install_scope: row[12] === null || row[12] === undefined ? null : String(row[12]),
      package_manager: row[13] === null || row[13] === undefined ? null : String(row[13]),
      source_type: row[14] === null || row[14] === undefined ? null : String(row[14]),
      direct_dependency: row[15] === null || row[15] === undefined ? null : Number(row[15]),
      has_lifecycle_scripts: Number(row[16] || 0),
      confidence: row[17] === null || row[17] === undefined ? null : String(row[17]),
      requested_spec: row[18] === null || row[18] === undefined ? null : String(row[18]),
      server_name: row[19] === null || row[19] === undefined ? null : String(row[19]),
      observed_at: String(row[20])
    }));
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
  return ["summary_json", "object_key", "hmac_key_ciphertext", "hmac_key_nonce", "body_sha256", "source_file", "project_path"]
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

function packageRecord(runID: string, deviceID: string, name = "left-pad", version = "1.3.0", profile = "baseline"): object {
  return {
    record_type: "package",
    record_id: `package:${profile}:${name}:${version}`,
    schema_version: "0.1.0",
    scanner_name: "bumblebee",
    scanner_version: "v-test",
    run_id: runID,
    scan_time: "2026-05-27T00:00:00.000Z",
    endpoint: { device_id: deviceID },
    profile,
    ecosystem: "npm",
    package_name: name,
    normalized_name: name,
    version,
    root_kind: "project_root",
    package_manager: "npm",
    source_type: "package-lock",
    source_file: "redacted-by-api",
    direct_dependency: true,
    has_lifecycle_scripts: false,
    confidence: "high"
  };
}

function findingRecord(runID: string, deviceID: string, profile = "baseline"): object {
  return {
    record_type: "finding",
    record_id: `finding:${profile}:left-pad:1.3.0:advisory-1`,
    schema_version: "0.1.0",
    scanner_name: "bumblebee",
    scanner_version: "v-test",
    run_id: runID,
    scan_time: "2026-05-27T00:00:00.000Z",
    endpoint: { device_id: deviceID },
    profile,
    finding_type: "package_exposure",
    severity: "critical",
    catalog_id: "advisory-1",
    catalog_name: "left-pad test advisory",
    ecosystem: "npm",
    package_name: "left-pad",
    normalized_name: "left-pad",
    version: "1.3.0",
    root_kind: "project_root",
    source_type: "package-lock",
    source_file: "redacted-by-api",
    confidence: "high",
    evidence: "exact test match"
  };
}

function summaryRecord(runID: string, deviceID: string, profile = "baseline", status = "complete"): object {
  return {
    record_type: "scan_summary",
    record_id: `summary:${profile}:${runID}:${status}`,
    schema_version: "0.1.0",
    scanner_name: "bumblebee",
    scanner_version: "v-test",
    run_id: runID,
    scan_time: "2026-05-27T00:00:00.000Z",
    end_time: "2026-05-27T00:00:01.000Z",
    endpoint: { device_id: deviceID },
    profile,
    status,
    package_records_emitted: 1,
    findings_emitted: 0,
    duplicates: 0,
    diagnostics_count: 0,
    files_considered: 1,
    timed_out: false,
    duration_ms: 1000
  };
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
    const devicePath = await worker.fetch(new Request("https://hive.example.test/admin/devices/device-1?inventory_view=package"), env);
    const appAsset = await worker.fetch(new Request("https://hive.example.test/admin/app.js"), env);

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe("/admin/");
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toContain("text/html");
    expect(await page.text()).toContain("Bumblebee Hive Admin");
    expect(devicePath.status).toBe(200);
    expect(devicePath.headers.get("Content-Type")).toContain("text/html");
    expect(await devicePath.text()).toContain("Bumblebee Hive Admin");
    expect(appAsset.status).toBe(200);
    expect(appAsset.headers.get("Content-Type")).toContain("application/javascript");
    expect(await appAsset.text()).toBe("app");
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

  it("normalizes complete package batches into current inventory idempotently", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = [
      JSON.stringify(packageRecord("run-1", "device-1")),
      JSON.stringify(findingRecord("run-1", "device-1")),
      JSON.stringify(summaryRecord("run-1", "device-1"))
    ].join("\n") + "\n";

    const response = await worker.fetch(await signedRequest(env, gzipSync(ndjson), hmacKey), env);
    expect(response.status).toBe(200);
    const message = env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string };

    await testInternals.normalizeQueuedBatch(env, message);
    await testInternals.normalizeQueuedBatch(env, message);

    expect(env.DB.inventoryRecords.size).toBe(2);
    expect(env.DB.inventoryCurrent.size).toBe(1);
    expect(env.DB.exposureFindings.size).toBe(1);
    const packageResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/packages?query=left-pad", {
      headers: adminHeaders(env)
    }), env);
    const packageBody = await packageResponse.json() as { view: string; packages: Array<{ normalized_name: string; occurrence_count: number; record_id?: string; source_file?: string; project_path?: string }> };
    expect(packageResponse.status).toBe(200);
    expect(packageBody.view).toBe("summary");
    expect(packageBody.packages).toEqual([expect.objectContaining({ normalized_name: "left-pad", occurrence_count: 1 })]);
    expect(packageBody.packages[0].record_id).toBeUndefined();
    expect(packageBody.packages[0].source_file).toBeUndefined();
    expect(packageBody.packages[0].project_path).toBeUndefined();
    expect(forbiddenVisibilityFields(packageBody)).toEqual([]);
  });

  it("defaults package inventory to deduped summaries and keeps explicit observations available", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const lockRecord = packageRecord("run-1", "device-1", "left-pad", "1.3.0");
    const moduleRecord = {
      ...packageRecord("run-1", "device-1", "left-pad", "1.3.0"),
      record_id: "package:baseline:left-pad:1.3.0:node_modules",
      root_kind: "user_package_root",
      source_type: "node_modules",
      direct_dependency: false,
      has_lifecycle_scripts: true
    };
    const ndjson = [
      JSON.stringify(lockRecord),
      JSON.stringify(moduleRecord),
      JSON.stringify(summaryRecord("run-1", "device-1"))
    ].join("\n") + "\n";

    const response = await worker.fetch(await signedRequest(env, gzipSync(ndjson), hmacKey), env);
    expect(response.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string });

    const summaryResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/packages?query=left-pad", {
      headers: adminHeaders(env)
    }), env);
    const observationResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/packages?query=left-pad&view=observations", {
      headers: adminHeaders(env)
    }), env);
    const summaryBody = await summaryResponse.json() as {
      view: string;
      packages: Array<{
        normalized_name: string;
        occurrence_count: number;
        source_types: string[];
        root_kinds: string[];
        has_lifecycle_scripts: boolean;
        direct_dependency_present: boolean;
        record_id?: string;
      }>;
    };
    const observationBody = await observationResponse.json() as { view: string; packages: Array<{ normalized_name: string; record_id: string }> };

    expect(summaryResponse.status).toBe(200);
    expect(summaryBody.view).toBe("summary");
    expect(summaryBody.packages).toHaveLength(1);
    expect(summaryBody.packages[0]).toEqual(expect.objectContaining({
      normalized_name: "left-pad",
      occurrence_count: 2,
      source_types: ["node_modules", "package-lock"],
      root_kinds: ["project_root", "user_package_root"],
      has_lifecycle_scripts: true,
      direct_dependency_present: true
    }));
    expect(summaryBody.packages[0].record_id).toBeUndefined();
    expect(observationResponse.status).toBe(200);
    expect(observationBody.view).toBe("observations");
    expect(observationBody.packages).toHaveLength(2);
    expect(observationBody.packages.every((pkg) => pkg.normalized_name === "left-pad" && pkg.record_id)).toBe(true);
    expect(forbiddenVisibilityFields(summaryBody)).toEqual([]);
    expect(forbiddenVisibilityFields(observationBody)).toEqual([]);
  });

  it("groups package-family inventory by package while preserving version detail and device boundaries", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    await addDevice(env, "device-2", hmacKey);
    const deviceOneNDJSON = [
      JSON.stringify(packageRecord("run-1", "device-1", "left-pad", "1.0.0")),
      JSON.stringify(packageRecord("run-1", "device-1", "left-pad", "2.0.0")),
      JSON.stringify(summaryRecord("run-1", "device-1"))
    ].join("\n") + "\n";
    const deviceTwoNDJSON = [
      JSON.stringify(packageRecord("run-2", "device-2", "left-pad", "1.0.0")),
      JSON.stringify(summaryRecord("run-2", "device-2"))
    ].join("\n") + "\n";

    const deviceOneResponse = await worker.fetch(await signedRequest(env, gzipSync(deviceOneNDJSON), hmacKey, {
      "X-Inventory-Device-Id": "device-1"
    }), env);
    const deviceTwoResponse = await worker.fetch(await signedRequest(env, gzipSync(deviceTwoNDJSON), hmacKey, {
      "X-Inventory-Device-Id": "device-2"
    }), env);
    expect(deviceOneResponse.status).toBe(200);
    expect(deviceTwoResponse.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string });
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[1] as { device_id: string; run_id: string; batch_id: string });

    const familyResponse = await worker.fetch(new Request("https://hive.example.test/v1/admin/packages?query=left-pad&view=package", {
      headers: adminHeaders(env)
    }), env);
    const familyBody = await familyResponse.json() as {
      view: string;
      packages: Array<{
        device_id: string;
        normalized_name: string;
        version_count: number;
        total_occurrence_count: number;
        versions: Array<{ version: string; occurrence_count: number }>;
        record_id?: string;
      }>;
    };

    expect(familyResponse.status).toBe(200);
    expect(familyBody.view).toBe("package");
    expect(familyBody.packages).toHaveLength(2);
    const deviceOnePackage = familyBody.packages.find((pkg) => pkg.device_id === "device-1");
    const deviceTwoPackage = familyBody.packages.find((pkg) => pkg.device_id === "device-2");
    expect(deviceOnePackage).toEqual(expect.objectContaining({
      normalized_name: "left-pad",
      version_count: 2,
      total_occurrence_count: 2
    }));
    expect(deviceOnePackage?.versions.map((version) => version.version).sort()).toEqual(["1.0.0", "2.0.0"]);
    expect(deviceTwoPackage).toEqual(expect.objectContaining({
      normalized_name: "left-pad",
      version_count: 1,
      total_occurrence_count: 1
    }));
    expect(deviceOnePackage?.record_id).toBeUndefined();
    expect(forbiddenVisibilityFields(familyBody)).toEqual([]);
  });

  it("promotes current inventory only after a complete baseline or project summary", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const packageOnly = JSON.stringify(packageRecord("run-1", "device-1")) + "\n";
    const packageResponse = await worker.fetch(await signedRequest(env, gzipSync(packageOnly), hmacKey), env);
    expect(packageResponse.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string });
    expect(env.DB.inventoryRecords.size).toBe(1);
    expect(env.DB.inventoryCurrent.size).toBe(0);

    const summaryOnly = JSON.stringify(summaryRecord("run-1", "device-1")) + "\n";
    const summaryResponse = await worker.fetch(await signedRequest(env, gzipSync(summaryOnly), hmacKey), env);
    expect(summaryResponse.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[1] as { device_id: string; run_id: string; batch_id: string });
    expect(env.DB.inventoryCurrent.size).toBe(1);
  });

  it("keeps deep inventory out of current state while preserving evidence", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = [
      JSON.stringify(packageRecord("run-deep", "device-1", "campaign-only", "9.9.9", "deep")),
      JSON.stringify(summaryRecord("run-deep", "device-1", "deep", "complete"))
    ].join("\n") + "\n";

    const response = await worker.fetch(await signedRequest(env, gzipSync(ndjson), hmacKey), env);
    expect(response.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string });

    expect(env.DB.inventoryRecords.size).toBe(1);
    expect(env.DB.inventoryCurrent.size).toBe(0);
  });

  it("returns UI package inventory with Access JWT and no admin token", async () => {
    const env = makeEnv();
    const hmacKey = "device-secret";
    await addDevice(env, "device-1", hmacKey);
    const ndjson = [
      JSON.stringify(packageRecord("run-1", "device-1")),
      JSON.stringify(summaryRecord("run-1", "device-1"))
    ].join("\n") + "\n";
    const ingestResponse = await worker.fetch(await signedRequest(env, gzipSync(ndjson), hmacKey), env);
    expect(ingestResponse.status).toBe(200);
    await testInternals.normalizeQueuedBatch(env, env.NORMALIZE_QUEUE.messages[0] as { device_id: string; run_id: string; batch_id: string });

    const token = await accessJWT(env);
    const packagesResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/packages?query=left&view=package", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);
    const detailResponse = await worker.fetch(new Request("https://hive.example.test/v1/ui/admin/devices/device-1/packages?view=package", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }), env);

    const packagesBody = await packagesResponse.json() as { view: string };
    const detailBody = await detailResponse.json() as { view: string };
    expect(packagesResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(packagesBody.view).toBe("package");
    expect(detailBody.view).toBe("package");
    expect(forbiddenVisibilityFields(packagesBody)).toEqual([]);
    expect(forbiddenVisibilityFields(detailBody)).toEqual([]);
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
