CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('photography-studio','rehearsal-room','podcast-booth')),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  equipment_json TEXT NOT NULL,
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate > 0),
  opening_hours_json TEXT NOT NULL,
  image_url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
  space_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  private_token TEXT NOT NULL UNIQUE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  duration_hours INTEGER NOT NULL CHECK (duration_hours BETWEEN 1 AND 4),
  hourly_rate INTEGER NOT NULL CHECK (hourly_rate > 0),
  total_price INTEGER NOT NULL CHECK (total_price > 0),
  status TEXT NOT NULL CHECK (status IN ('confirmed','cancelled')),
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS bookings_overlap ON bookings(space_id,status,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS booking_submissions (
  submission_key TEXT PRIMARY KEY,
  request_json TEXT NOT NULL,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE
);
