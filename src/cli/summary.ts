import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const summaryCommand = new Command('summary')
  .description('Summarise metrics (averages) over N days')
  .option('--days <n>', 'Last N days', '90')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT metric, units,
             AVG(qty) as avg_qty, MIN(qty) as min_qty, MAX(qty) as max_qty,
             COUNT(*) as count,
             MIN(date) as first_date, MAX(date) as last_date
      FROM metrics
      WHERE date >= ? AND qty IS NOT NULL
      GROUP BY metric, units
      ORDER BY metric ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
