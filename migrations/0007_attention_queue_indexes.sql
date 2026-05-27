CREATE INDEX IF NOT EXISTS idx_normalization_jobs_device_run_started
  ON normalization_jobs(device_id, run_id, started_at DESC);
