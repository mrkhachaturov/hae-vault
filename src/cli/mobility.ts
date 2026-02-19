import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { sinceDate } from './helpers.js';
import type Database from 'better-sqlite3';

export interface MobilityDay {
  date: string;
  walking_speed_kmh: number | null;
  step_length_cm: number | null;
  asymmetry_pct: number | null;
  double_support_pct: number | null;
  stair_speed_up_ms: number | null;
  stair_speed_down_ms: number | null;
  six_min_walk_m: number | null;
}

export function queryMobilityDaily(db: Database.Database, since: string): MobilityDay[] {
  return db.prepare(`
    SELECT
      date,
      ROUND(AVG(CASE WHEN metric = 'walking_speed' THEN qty END), 2) as walking_speed_kmh,
      ROUND(AVG(CASE WHEN metric = 'walking_step_length' THEN qty END), 1) as step_length_cm,
      ROUND(AVG(CASE WHEN metric = 'walking_asymmetry_percentage' THEN qty END), 1) as asymmetry_pct,
      ROUND(AVG(CASE WHEN metric = 'walking_double_support_percentage' THEN qty END), 1) as double_support_pct,
      ROUND(AVG(CASE WHEN metric = 'stair_speed_up' THEN qty END), 3) as stair_speed_up_ms,
      ROUND(AVG(CASE WHEN metric = 'stair_speed_down' THEN qty END), 3) as stair_speed_down_ms,
      MAX(CASE WHEN metric = 'six_minute_walking_test_distance' THEN qty END) as six_min_walk_m
    FROM metrics
    WHERE metric IN ('walking_speed','walking_step_length','walking_asymmetry_percentage',
                     'walking_double_support_percentage','stair_speed_up','stair_speed_down',
                     'six_minute_walking_test_distance')
      AND date >= ?
      AND qty IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all(since) as MobilityDay[];
}

export const mobilityCommand = new Command('mobility')
  .description('Daily mobility metrics: walking speed, step length, gait symmetry, stair speed')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const rows = queryMobilityDaily(db, sinceDate(parseInt(opts.days, 10)));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
