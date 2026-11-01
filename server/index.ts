import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase, migrate } from './db.js';
import { seed } from './seed.js';
const db=openDatabase();
migrate(db);
seed(db);
const server=createApp(db).listen(config.port,'127.0.0.1',()=>console.log(`SpaceBook API listening on 127.0.0.1:${config.port} (${config.mode})`));
function shutdown() { server.close(()=>{db.close();process.exit(0);}); }
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
