CREATE TABLE IF NOT EXISTS catalog_releases (
  release_id TEXT PRIMARY KEY,
  source TEXT,
  schema_version TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  entry_count INTEGER NOT NULL,
  bundle_sha256 TEXT NOT NULL,
  published_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS catalog_files (
  release_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  PRIMARY KEY (release_id, path),
  FOREIGN KEY (release_id) REFERENCES catalog_releases(release_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_releases_active_published
  ON catalog_releases(active, published_at DESC);
