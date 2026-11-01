CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_throttle (
  fingerprint TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK(attempts >= 0),
  window_start INTEGER NOT NULL
);
ALTER TABLE bookings ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS bookings_owner_idx ON bookings(user_id,starts_at);
