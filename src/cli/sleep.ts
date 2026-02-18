import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';

export const sleepCommand = new Command('sleep')
  .description('Query sleep data')
  .option('--days <n>', 'Last N days', '14')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT date, sleep_start, sleep_end, core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h, schema_ver, source
      FROM sleep
      WHERE date >= ?
      ORDER BY date ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
