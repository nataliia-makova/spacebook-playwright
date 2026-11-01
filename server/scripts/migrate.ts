import { openDatabase, migrate } from '../db.js';
const db = openDatabase();
try { migrate(db); console.log('Database migrations applied.'); } finally { db.close(); }
