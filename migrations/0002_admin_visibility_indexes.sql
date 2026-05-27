CREATE INDEX IF NOT EXISTS idx_devices_disabled_at ON devices(disabled_at);
CREATE INDEX IF NOT EXISTS idx_runs_device_received_at ON runs(device_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_received_at ON runs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status_profile_received_at ON runs(status, profile, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_device_run ON batches(device_id, run_id);
