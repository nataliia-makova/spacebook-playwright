import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export type Database = DatabaseSync;
export function openDatabase(file = config.dbPath): Database {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;');
  return db;
}
/** SQLite reserves a write lock before checking overlaps. This works across connections/processes. */
export function immediate<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function migrate(db: Database): void {
  const migrations = path.resolve(process.cwd(), 'migrations');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(file)) continue;
    immediate(db, () => {
      db.exec(readFileSync(path.join(migrations, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    });
  }
}
