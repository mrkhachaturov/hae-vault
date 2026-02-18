import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';
import { tick } from './watch.js';
import { config } from '../config.js';

export const startCommand = new Command('start')
  .description('Start server and watcher based on environment variables (HVAULT_PORT, HVAULT_WATCH_DIR)')
  .action(() => {
    const db = openDb(config.dbPath);

    // Always start HTTP server
    const app = createApp(db, { token: config.token });
    app.listen(config.port, () => {
      console.log(JSON.stringify({ server: `http://0.0.0.0:${config.port}/api/ingest`, auth: !!config.token }));
    });

    // Start watcher only if HVAULT_WATCH_DIR is set
    if (config.watchDir) {
      console.log(JSON.stringify({ watching: config.watchDir, intervalSeconds: config.watchInterval, target: config.target }));
      tick(db, config.watchDir, config.target);
      setInterval(() => tick(db, config.watchDir!, config.target), config.watchInterval * 1000);
    }
  });
