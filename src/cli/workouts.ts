import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';

export const workoutsCommand = new Command('workouts')
  .description('Query workouts')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT ts, date, name, duration_s, calories_kj, distance, distance_unit, avg_hr, max_hr, target
      FROM workouts
      WHERE date >= ?
      ORDER BY ts ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
