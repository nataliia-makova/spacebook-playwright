import { openDatabase, migrate } from '../db.js';
import { seed } from '../seed.js';
const db = openDatabase();
try { migrate(db); seed(db); console.log('Seed spaces ensured.'); } finally { db.close(); }
