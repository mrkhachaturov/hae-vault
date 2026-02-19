import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { sinceDate } from './helpers.js';
import type Database from 'better-sqlite3';

export interface BodyDay {
  date: string;
  weight_kg: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  lean_mass_kg: number | null;
}

export function queryBodyDailyReadings(db: Database.Database, since: string): BodyDay[] {
  return db.prepare(`
    SELECT
      date,
      MAX(CASE WHEN metric = 'weight_body_mass' THEN qty END) as weight_kg,
      MAX(CASE WHEN metric = 'body_mass_index' THEN qty END) as bmi,
      MAX(CASE WHEN metric = 'body_fat_percentage' THEN qty END) as body_fat_pct,
      MAX(CASE WHEN metric = 'lean_body_mass' THEN qty END) as lean_mass_kg
    FROM metrics
    WHERE metric IN ('weight_body_mass','body_mass_index','body_fat_percentage','lean_body_mass')
      AND date >= ?
      AND qty IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all(since) as BodyDay[];
}

export const bodyCommand = new Command('body')
  .description('Daily body composition readings: weight, BMI, body fat, lean mass')
  .option('--days <n>', 'Last N days', '90')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const rows = queryBodyDailyReadings(db, sinceDate(parseInt(opts.days, 10)));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
