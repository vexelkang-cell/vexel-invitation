CREATE TABLE IF NOT EXISTS invitations (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Undangan Pernikahan',
  payload TEXT NOT NULL,
  html TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at);

-- Konfigurasi kategori dan tampilan katalog template
CREATE TABLE IF NOT EXISTS catalog_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
