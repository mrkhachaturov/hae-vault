import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { sinceDate } from './helpers.js';
import type Database from 'better-sqlite3';

export interface VitalsDay {
  date: string;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  walking_hr_avg_bpm: number | null;
  spo2_pct: number | null;
  respiratory_rate: number | null;
  cardio_recovery_bpm: number | null;
  vo2_max: number | null;
  systolic_mmhg: number | null;
  diastolic_mmhg: number | null;
}

export function queryVitalsDaily(db: Database.Database, since: string): VitalsDay[] {
  // Main pivot — all vitals except blood_pressure
  const mainRows = db.prepare(`
    SELECT
      date,
      ROUND(AVG(CASE WHEN metric = 'resting_heart_rate' THEN qty END), 1) as resting_hr_bpm,
      ROUND(AVG(CASE WHEN metric = 'heart_rate_variability' THEN qty END), 1) as hrv_ms,
      ROUND(AVG(CASE WHEN metric = 'walking_heart_rate_average' THEN qty END), 1) as walking_hr_avg_bpm,
      ROUND(AVG(CASE WHEN metric = 'blood_oxygen_saturation' THEN qty END), 1) as spo2_pct,
      ROUND(AVG(CASE WHEN metric = 'respiratory_rate' THEN qty END), 1) as respiratory_rate,
      ROUND(AVG(CASE WHEN metric = 'cardio_recovery' THEN qty END), 1) as cardio_recovery_bpm,
      ROUND(AVG(CASE WHEN metric = 'vo2_max' THEN qty END), 1) as vo2_max
    FROM metrics
    WHERE metric IN ('resting_heart_rate','heart_rate_variability','walking_heart_rate_average',
                     'blood_oxygen_saturation','respiratory_rate','cardio_recovery','vo2_max')
      AND date >= ?
      AND qty IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `).all(since) as Omit<VitalsDay, 'systolic_mmhg' | 'diastolic_mmhg'>[];

  // Blood pressure — latest reading per day from meta JSON
  const bpRows = db.prepare(`
    SELECT date, meta FROM metrics
    WHERE metric = 'blood_pressure' AND date >= ? AND meta IS NOT NULL
    ORDER BY ts DESC
  `).all(since) as { date: string; meta: string }[];

  const bpMap = new Map<string, { systolic_mmhg: number; diastolic_mmhg: number }>();
  for (const row of bpRows) {
    if (!bpMap.has(row.date)) {
      try {
        const p = JSON.parse(row.meta) as { systolic?: number; diastolic?: number };
        if (p.systolic && p.diastolic) {
          bpMap.set(row.date, { systolic_mmhg: p.systolic, diastolic_mmhg: p.diastolic });
        }
      } catch { /* skip malformed */ }
    }
  }

  // Merge all dates (union of both query result sets)
  const dateSet = new Set([...mainRows.map(r => r.date), ...bpMap.keys()]);
  const mainMap = new Map(mainRows.map(r => [r.date, r]));
  const allDates = Array.from(dateSet).sort();

  return allDates.map(date => ({
    date,
    resting_hr_bpm: mainMap.get(date)?.resting_hr_bpm ?? null,
    hrv_ms: mainMap.get(date)?.hrv_ms ?? null,
    walking_hr_avg_bpm: mainMap.get(date)?.walking_hr_avg_bpm ?? null,
    spo2_pct: mainMap.get(date)?.spo2_pct ?? null,
    respiratory_rate: mainMap.get(date)?.respiratory_rate ?? null,
    cardio_recovery_bpm: mainMap.get(date)?.cardio_recovery_bpm ?? null,
    vo2_max: mainMap.get(date)?.vo2_max ?? null,
    systolic_mmhg: bpMap.get(date)?.systolic_mmhg ?? null,
    diastolic_mmhg: bpMap.get(date)?.diastolic_mmhg ?? null,
  }));
}

export const vitalsCommand = new Command('vitals')
  .description('Daily vitals: resting HR, HRV, SpO2, VO2max, blood pressure, cardio recovery')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const rows = queryVitalsDaily(db, sinceDate(parseInt(opts.days, 10)));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
