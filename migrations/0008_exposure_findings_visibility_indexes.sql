CREATE INDEX IF NOT EXISTS idx_exposure_findings_received
  ON exposure_findings(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_exposure_findings_device_received
  ON exposure_findings(device_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_exposure_findings_severity_received
  ON exposure_findings(severity, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_exposure_findings_catalog_received
  ON exposure_findings(catalog_id, received_at DESC);
