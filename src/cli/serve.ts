import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';

export const serveCommand = new Command('serve')
  .description('Start HTTP server to receive Health Auto Export pushes')
  .option('-p, --port <number>', 'Port to listen on', String(config.port))
  .option('--token <secret>', 'Require Authorization: Bearer <secret>', config.token)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const app = createApp(db, { token: opts.token });
    const port = parseInt(opts.port, 10);
    app.listen(port, () => {
      console.log(`hvault server listening on http://0.0.0.0:${port}/api/ingest`);
      if (opts.token) console.log('Auth: Bearer token required');
    });
  });
