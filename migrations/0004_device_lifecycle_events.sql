CREATE TABLE IF NOT EXISTS device_lifecycle_events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('disable', 'enable')),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_disabled_at TEXT,
  new_disabled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_lifecycle_events_device_created_at
  ON device_lifecycle_events(device_id, created_at DESC);
