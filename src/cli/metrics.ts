import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const metricsCommand = new Command('metrics')
  .description('Query health metrics')
  .requiredOption('--metric <name>', 'Metric name (e.g. step_count, heart_rate)')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT ts, date, qty, min, avg, max, units, source, target
      FROM metrics
      WHERE metric = ? AND date >= ?
      ORDER BY ts ASC
    `).all(opts.metric, since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
