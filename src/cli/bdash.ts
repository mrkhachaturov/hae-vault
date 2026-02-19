import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { ruler, pad, arrow, sinceDate } from './helpers.js';
import { queryBodyDailyReadings, type BodyDay } from './body.js';
import type Database from 'better-sqlite3';

function trendRowBody(rows: BodyDay[], label: string, field: keyof BodyDay, unit: string, decimals = 1): string {
  const vals = rows.map(r => r[field] as number | null).filter((v): v is number => v != null);
  if (vals.length < 2) return '';
  const first = vals[0];
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dir = arrow(first, last);
  const fmt = (v: number) => v.toFixed(decimals);
  return `   ${pad(label + ':', 14)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function renderBdash(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)): string {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const allRows = queryBodyDailyReadings(db, since);
  const latest = allRows.length > 0 ? allRows[allRows.length - 1] : null;

  const lines: string[] = [];
  lines.push(`📅 ${today} | ⚖️  Body Composition Dashboard`);
  lines.push('');

  // ── Current ────────────────────────────────────────────────────────────────
  lines.push(ruler('Current'));
  if (latest) {
    const note = latest.date !== today ? `  (latest: ${latest.date})` : '';
    const w = latest.weight_kg != null ? `⚖️  ${latest.weight_kg.toFixed(1)} kg` : '⚖️  —';
    const bmi = latest.bmi != null ? `BMI: ${latest.bmi.toFixed(1)}` : 'BMI: —';
    const bf = latest.body_fat_pct != null ? `Body Fat: ${latest.body_fat_pct.toFixed(1)}%` : 'Body Fat: —';
    lines.push(`${w}  |  ${bmi}  |  ${bf}${note}`);
    const lm = latest.lean_mass_kg != null ? `${latest.lean_mass_kg.toFixed(1)} kg` : '—';
    lines.push(`   💪 Lean mass: ${lm}`);
  } else {
    lines.push('   No body composition data');
  }
  lines.push('');

  // ── Trends ─────────────────────────────────────────────────────────────────
  lines.push(ruler(`${days}-Day Trends`));
  const trendLines = [
    trendRowBody(allRows, 'Weight', 'weight_kg', ' kg', 1),
    trendRowBody(allRows, 'Body Fat', 'body_fat_pct', '%', 1),
    trendRowBody(allRows, 'BMI', 'bmi', '', 1),
  ].filter(Boolean);
  if (trendLines.length > 0) {
    lines.push(...trendLines);
  } else {
    lines.push('   Insufficient data for trends');
  }

  return lines.join('\n');
}

export function bdashJson(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)) {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const rows = queryBodyDailyReadings(db, since);
  const current = rows.length > 0 ? rows[rows.length - 1] : null;
  return { date: today, current, trend: rows };
}

export const bdashCommand = new Command('bdash')
  .description('Body composition dashboard: weight, BMI, body fat trends')
  .option('--days <n>', 'Trend window in days', '30')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    if (opts.json) {
      console.log(JSON.stringify(bdashJson(db, days), null, 2));
    } else {
      console.log(renderBdash(db, days));
    }
  });
