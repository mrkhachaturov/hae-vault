import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';

export const serveCommand = new Command('serve')
  .description('Start HTTP server to receive Health Auto Export pushes')
  .option('-p, --port <number>', 'Port to listen on', '4242')
  .option('--token <secret>', 'Require Authorization: Bearer <secret>')
  .action((opts) => {
    const db = openDb();
    const app = createApp(db, { token: opts.token });
    const port = parseInt(opts.port, 10);
    app.listen(port, () => {
      console.log(`hvault server listening on http://0.0.0.0:${port}/api/ingest`);
      if (opts.token) console.log('Auth: Bearer token required');
    });
  });
