CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  hmac_key_ciphertext TEXT NOT NULL,
  hmac_key_nonce TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  content_encoding TEXT,
  object_key TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  summary_status TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS runs (
  device_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  scanner_version TEXT,
  received_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  PRIMARY KEY (device_id, profile, run_id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
