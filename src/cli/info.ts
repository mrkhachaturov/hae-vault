import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const sourcesCommand = new Command('sources')
  .description('Show what metrics are in the DB and their date coverage')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const rows = db.prepare(`
      SELECT metric, units, COUNT(*) as count, MIN(date) as first_date, MAX(date) as last_date
      FROM metrics GROUP BY metric, units ORDER BY metric
    `).all();
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });

export const lastSyncCommand = new Command('last-sync')
  .description('Show when the last HAE push was received')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const row = db.prepare(`SELECT * FROM sync_log ORDER BY received_at DESC LIMIT 1`).get();
    console.log(opts.pretty ? JSON.stringify(row, null, 2) : JSON.stringify(row));
  });

export const statsCommand = new Command('stats')
  .description('Show row counts per table')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const metrics = (db.prepare('SELECT COUNT(*) as count FROM metrics').get() as { count: number }).count;
    const sleep = (db.prepare('SELECT COUNT(*) as count FROM sleep').get() as { count: number }).count;
    const workouts = (db.prepare('SELECT COUNT(*) as count FROM workouts').get() as { count: number }).count;
    const syncs = (db.prepare('SELECT COUNT(*) as count FROM sync_log').get() as { count: number }).count;
    const result = { metrics, sleep, workouts, syncs };
    console.log(opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  });
