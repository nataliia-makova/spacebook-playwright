import 'dotenv/config';
import path from 'node:path';

// SpaceBook is a local application under test. A single SQLite file is shared by
// manual exploration and Playwright; legacy test/production settings are retained
// for backend isolation and safety checks.
export const config = {
  mode: process.env.APP_ENV || 'local',
  dbPath: path.resolve(process.env.DB_PATH || './data/spacebook.sqlite'),
  port: Number(process.env.PORT || '3001'),
  origin: (process.env.APP_ORIGIN || 'http://127.0.0.1:3001').replace(/\/$/, '')
};
if (!['local', 'development', 'test', 'production'].includes(config.mode)) throw new Error('APP_ENV must be local, development, test, or production.');
if (config.mode === 'production' && !process.env.APP_ORIGIN) throw new Error('Production requires APP_ORIGIN.');
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid PORT.');
