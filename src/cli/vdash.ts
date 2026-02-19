import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { ruler, pad, arrow, sinceDate } from './helpers.js';
import { queryVitalsDaily, type VitalsDay } from './vitals.js';
import type Database from 'better-sqlite3';

function trendRowVitals(rows: VitalsDay[], label: string, field: keyof VitalsDay, unit: string, round = true): string {
  const vals = rows.map(r => r[field] as number | null).filter((v): v is number => v != null);
  if (vals.length < 2) return '';
  const first = vals[0];
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dir = arrow(first, last);
  const fmt = round ? (v: number) => Math.round(v).toString() : (v: number) => v.toFixed(1);
  return `   ${pad(label + ':', 18)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function renderVdash(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)): string {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const allRows = queryVitalsDaily(db, since);
  const latest = allRows.length > 0 ? allRows[allRows.length - 1] : null;

  const lines: string[] = [];
  lines.push(`📅 ${today} | 💓 Vitals Dashboard`);
  lines.push('');

  // ── Current ────────────────────────────────────────────────────────────────
  lines.push(ruler('Current'));
  if (latest) {
    const note = latest.date !== today ? `  (latest: ${latest.date})` : '';
    const rhr = latest.resting_hr_bpm != null ? `💓 Resting HR: ${Math.round(latest.resting_hr_bpm)}bpm` : '💓 Resting HR: —';
    const hrv = latest.hrv_ms != null ? `HRV: ${Math.round(latest.hrv_ms)}ms` : 'HRV: —';
    const spo2 = latest.spo2_pct != null ? `🩺 SpO2: ${latest.spo2_pct.toFixed(1)}%` : '🩺 SpO2: —';
    lines.push(`${rhr}  |  ${hrv}  |  ${spo2}${note}`);

    const parts: string[] = [];
    if (latest.respiratory_rate != null) parts.push(`🫁 Resp: ${latest.respiratory_rate.toFixed(1)}/min`);
    if (latest.cardio_recovery_bpm != null) parts.push(`🫀 Recovery: ${Math.round(latest.cardio_recovery_bpm)}bpm`);
    if (latest.vo2_max != null) parts.push(`🏃 VO2max: ${latest.vo2_max.toFixed(1)}`);
    if (latest.walking_hr_avg_bpm != null) parts.push(`🚶 Walk HR: ${Math.round(latest.walking_hr_avg_bpm)}bpm`);
    if (parts.length > 0) lines.push(`   ${parts.join('  |  ')}`);

    if (latest.systolic_mmhg != null && latest.diastolic_mmhg != null) {
      lines.push(`   🩸 Blood pressure: ${latest.systolic_mmhg}/${latest.diastolic_mmhg} mmHg`);
    }
  } else {
    lines.push('   No vitals data');
  }
  lines.push('');

  // ── Trends ─────────────────────────────────────────────────────────────────
  lines.push(ruler(`${days}-Day Trends`));
  const trendLines = [
    trendRowVitals(allRows, 'Resting HR', 'resting_hr_bpm', 'bpm', true),
    trendRowVitals(allRows, 'HRV', 'hrv_ms', 'ms', true),
    trendRowVitals(allRows, 'SpO2', 'spo2_pct', '%', false),
    trendRowVitals(allRows, 'VO2max', 'vo2_max', '', false),
    trendRowVitals(allRows, 'Resp. rate', 'respiratory_rate', '/min', false),
    trendRowVitals(allRows, 'Cardio recovery', 'cardio_recovery_bpm', 'bpm', true),
  ].filter(Boolean);
  if (trendLines.length > 0) {
    lines.push(...trendLines);
  } else {
    lines.push('   Insufficient data for trends');
  }

  return lines.join('\n');
}

export function vdashJson(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)) {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const rows = queryVitalsDaily(db, since);
  const current = rows.length > 0 ? rows[rows.length - 1] : null;
  return { date: today, current, trend: rows };
}

export const vdashCommand = new Command('vdash')
  .description('Vitals dashboard: HR, HRV, SpO2, VO2max, blood pressure, recovery')
  .option('--days <n>', 'Trend window in days', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    if (opts.json) {
      console.log(JSON.stringify(vdashJson(db, days), null, 2));
    } else {
      console.log(renderVdash(db, days));
    }
  });
