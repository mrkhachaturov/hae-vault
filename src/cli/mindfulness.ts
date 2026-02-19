import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { sinceDate } from './helpers.js';
import type Database from 'better-sqlite3';

export interface MindfulnessDay {
  date: string;
  mindful_min: number | null;
  handwashing_count: number;
  daylight_min: number | null;
}

export function queryMindfulnessDaily(db: Database.Database, since: string): MindfulnessDay[] {
  return db.prepare(`
    SELECT
      date,
      NULLIF(SUM(CASE WHEN metric = 'mindful_minutes' THEN qty ELSE 0 END), 0) as mindful_min,
      COUNT(CASE WHEN metric = 'handwashing' THEN 1 END) as handwashing_count,
      NULLIF(SUM(CASE WHEN metric = 'time_in_daylight' THEN qty ELSE 0 END), 0) as daylight_min
    FROM metrics
    WHERE metric IN ('mindful_minutes','handwashing','time_in_daylight')
      AND date >= ?
      AND qty IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all(since) as MindfulnessDay[];
}

export const mindfulnessCommand = new Command('mindfulness')
  .description('Daily wellness metrics: mindful minutes, handwashing count, daylight')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const rows = queryMindfulnessDaily(db, sinceDate(parseInt(opts.days, 10)));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
