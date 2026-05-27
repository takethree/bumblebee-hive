CREATE INDEX IF NOT EXISTS idx_normalization_jobs_started
  ON normalization_jobs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalization_jobs_device_started
  ON normalization_jobs(device_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_normalization_jobs_status_started
  ON normalization_jobs(status, started_at DESC);
