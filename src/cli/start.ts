import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';
import { tick } from './watch.js';
import { config } from '../config.js';

export const startCommand = new Command('start')
  .description('Start server and watcher based on environment variables (HVAULT_PORT, HVAULT_WATCH_DIR)')
  .action(() => {
    console.log(JSON.stringify({ starting: true, dbPath: config.dbPath, port: config.port, watchDir: config.watchDir ?? null, auth: !!config.token }));

    let db: ReturnType<typeof openDb>;
    try {
      db = openDb(config.dbPath);
    } catch (err) {
      console.error(JSON.stringify({ error: 'Failed to open DB', detail: String(err) }));
      process.exit(1);
    }

    // Always start HTTP server
    const app = createApp(db, { token: config.token });
    const server = app.listen(config.port, () => {
      console.log(JSON.stringify({ server: `http://0.0.0.0:${config.port}/api/ingest`, auth: !!config.token }));
    });
    server.on('error', (err) => {
      console.error(JSON.stringify({ error: 'Server error', detail: String(err) }));
      process.exit(1);
    });

    // Start watcher only if HVAULT_WATCH_DIR is set
    if (config.watchDir) {
      console.log(JSON.stringify({ watching: config.watchDir, intervalSeconds: config.watchInterval, target: config.target }));
      tick(db, config.watchDir, config.target);
      setInterval(() => tick(db, config.watchDir!, config.target), config.watchInterval * 1000);
    } else {
      console.log(JSON.stringify({ watcher: 'disabled', reason: 'HVAULT_WATCH_DIR not set' }));
    }
  });
