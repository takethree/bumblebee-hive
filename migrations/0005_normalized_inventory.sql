CREATE TABLE IF NOT EXISTS normalization_jobs (
  batch_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'complete', 'error')),
  records_seen INTEGER NOT NULL DEFAULT 0,
  packages_seen INTEGER NOT NULL DEFAULT 0,
  findings_seen INTEGER NOT NULL DEFAULT 0,
  promoted_current INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS inventory_records (
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('package', 'finding')),
  profile TEXT NOT NULL,
  schema_version TEXT,
  scanner_version TEXT,
  scan_time TEXT,
  ecosystem TEXT NOT NULL,
  package_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  version TEXT,
  root_kind TEXT,
  install_scope TEXT,
  package_manager TEXT,
  source_type TEXT,
  direct_dependency INTEGER,
  has_lifecycle_scripts INTEGER NOT NULL DEFAULT 0,
  confidence TEXT,
  requested_spec TEXT,
  server_name TEXT,
  finding_type TEXT,
  severity TEXT,
  catalog_id TEXT,
  catalog_name TEXT,
  evidence TEXT,
  batch_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (device_id, run_id, record_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id),
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);

CREATE TABLE IF NOT EXISTS inventory_current (
  device_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  record_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  schema_version TEXT,
  scanner_version TEXT,
  scan_time TEXT,
  ecosystem TEXT NOT NULL,
  package_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  version TEXT,
  root_kind TEXT,
  install_scope TEXT,
  package_manager TEXT,
  source_type TEXT,
  direct_dependency INTEGER,
  has_lifecycle_scripts INTEGER NOT NULL DEFAULT 0,
  confidence TEXT,
  requested_spec TEXT,
  server_name TEXT,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (device_id, profile, record_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS exposure_findings (
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  severity TEXT,
  catalog_id TEXT NOT NULL,
  catalog_name TEXT,
  ecosystem TEXT NOT NULL,
  package_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  version TEXT,
  root_kind TEXT,
  source_type TEXT,
  confidence TEXT,
  evidence TEXT,
  batch_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (device_id, run_id, record_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id),
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_records_run
  ON inventory_records(device_id, run_id, record_type);

CREATE INDEX IF NOT EXISTS idx_inventory_current_package
  ON inventory_current(ecosystem, normalized_name, version);

CREATE INDEX IF NOT EXISTS idx_inventory_current_device
  ON inventory_current(device_id, profile, normalized_name);

CREATE INDEX IF NOT EXISTS idx_exposure_findings_package
  ON exposure_findings(ecosystem, normalized_name, version);
