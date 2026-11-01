import { openDatabase, migrate } from '../db.js';
import { seed } from '../seed.js';
const db = openDatabase();
try { migrate(db); seed(db); console.log('Database ready.'); } finally { db.close(); }
