ALTER TABLE devices ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'test'));

CREATE INDEX IF NOT EXISTS idx_devices_environment_disabled_at
  ON devices(environment, disabled_at);
