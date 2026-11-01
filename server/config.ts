import 'dotenv/config';
import path from 'node:path';

export const config = {
  mode: process.env.APP_ENV || 'development',
  dbPath: path.resolve(process.env.DB_PATH || (process.env.APP_ENV === 'test' ? './data/test.sqlite' : './data/dev.sqlite')),
  port: Number(process.env.PORT || '3001'),
  origin: (process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')
};
const devPath = path.resolve('./data/dev.sqlite');
if (!['development', 'test', 'production'].includes(config.mode)) throw new Error('APP_ENV must be development, test, or production.');
if (config.mode === 'test' && config.dbPath === devPath) {
  throw new Error('Test mode requires a separate DB_PATH, not the development database.');
}
if (config.mode === 'production' && !process.env.APP_ORIGIN) {
  throw new Error('Production requires APP_ORIGIN.');
}
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid PORT.');
