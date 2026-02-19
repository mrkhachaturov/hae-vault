import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { sinceDate } from './helpers.js';
import type Database from 'better-sqlite3';

export interface NutritionDay {
  date: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  cholesterol_mg: number | null;
}

export interface NutritionEntry {
  ts: string;
  date: string;
  metric: string;
  qty: number;
  units: string | null;
}

export function queryNutritionDailyTotals(db: Database.Database, since: string): NutritionDay[] {
  return db.prepare(`
    SELECT
      date,
      ROUND(SUM(CASE WHEN metric = 'dietary_energy' THEN qty / 4.184 ELSE 0 END), 1) as kcal,
      ROUND(SUM(CASE WHEN metric = 'protein' THEN qty ELSE 0 END), 1) as protein_g,
      ROUND(SUM(CASE WHEN metric = 'carbohydrates' THEN qty ELSE 0 END), 1) as carbs_g,
      ROUND(SUM(CASE WHEN metric = 'total_fat' THEN qty ELSE 0 END), 1) as fat_g,
      ROUND(SUM(CASE WHEN metric = 'fiber' THEN qty ELSE 0 END), 1) as fiber_g,
      ROUND(SUM(CASE WHEN metric = 'dietary_sugar' THEN qty ELSE 0 END), 1) as sugar_g,
      ROUND(SUM(CASE WHEN metric = 'sodium' THEN qty ELSE 0 END), 1) as sodium_mg,
      ROUND(SUM(CASE WHEN metric = 'cholesterol' THEN qty ELSE 0 END), 1) as cholesterol_mg
    FROM metrics
    WHERE metric IN ('dietary_energy','protein','carbohydrates','total_fat','fiber','dietary_sugar','sodium','cholesterol')
      AND date >= ?
      AND qty IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all(since) as NutritionDay[];
}

export function queryNutritionEntries(db: Database.Database, since: string): NutritionEntry[] {
  return db.prepare(`
    SELECT ts, date, metric, qty, units
    FROM metrics
    WHERE metric IN ('dietary_energy','protein','carbohydrates','total_fat','fiber','dietary_sugar','sodium','cholesterol')
      AND date >= ?
      AND qty IS NOT NULL
    ORDER BY ts ASC
  `).all(since) as NutritionEntry[];
}

export const nutritionCommand = new Command('nutrition')
  .description('Daily nutrition totals: calories, macros, sodium, cholesterol')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .option('--entries', 'Show individual log entries instead of daily totals', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const since = sinceDate(parseInt(opts.days, 10));
    const rows = opts.entries
      ? queryNutritionEntries(db, since)
      : queryNutritionDailyTotals(db, since);
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
