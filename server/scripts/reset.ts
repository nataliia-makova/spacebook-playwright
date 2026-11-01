import { rmSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { openDatabase, migrate } from '../db.js';
import { seed } from '../seed.js';
if (config.mode === 'production' || !config.dbPath.startsWith(path.resolve('./data') + path.sep)) {
  throw new Error('Reset is allowed only for local databases under ./data and outside production.');
}
for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force:true });
const db = openDatabase();
try { migrate(db); seed(db); console.log('Local database reset.'); } finally { db.close(); }
