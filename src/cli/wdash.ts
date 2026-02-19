import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { ruler, pad, arrow, sinceDate } from './helpers.js';
import { queryMindfulnessDaily, type MindfulnessDay } from './mindfulness.js';
import type Database from 'better-sqlite3';

function trendRowWellness(rows: MindfulnessDay[], label: string, field: keyof MindfulnessDay, unit: string): string {
  const vals = rows.map(r => r[field] as number | null).filter((v): v is number => v != null && v > 0);
  if (vals.length < 2) return '';
  const first = vals[0];
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dir = arrow(first, last);
  const fmt = (v: number) => Math.round(v).toString();
  return `   ${pad(label + ':', 16)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function renderWdash(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)): string {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const allRows = queryMindfulnessDaily(db, since);
  const latest = allRows.length > 0 ? allRows[allRows.length - 1] : null;

  const lines: string[] = [];
  lines.push(`📅 ${today} | 🧘 Wellness Dashboard`);
  lines.push('');

  // ── Today ──────────────────────────────────────────────────────────────────
  lines.push(ruler('Today'));
  if (latest) {
    const note = latest.date !== today ? `  (latest: ${latest.date})` : '';
    const m = latest.mindful_min != null ? `🧘 Mindfulness: ${Math.round(latest.mindful_min)}min` : '🧘 Mindfulness: —';
    const d = latest.daylight_min != null ? `🌅 Daylight: ${Math.round(latest.daylight_min)}min` : '🌅 Daylight: —';
    const h = `🫧 Handwashing: ${latest.handwashing_count}×`;
    lines.push(`${m}  |  ${d}  |  ${h}${note}`);
  } else {
    lines.push('   No wellness data');
  }
  lines.push('');

  // ── Trends ─────────────────────────────────────────────────────────────────
  lines.push(ruler(`${days}-Day Trends`));
  const trendLines = [
    trendRowWellness(allRows, 'Mindful min', 'mindful_min', ' min'),
    trendRowWellness(allRows, 'Daylight min', 'daylight_min', ' min'),
    trendRowWellness(allRows, 'Handwashing', 'handwashing_count', '×'),
  ].filter(Boolean);
  if (trendLines.length > 0) {
    lines.push(...trendLines);
  } else {
    lines.push('   Insufficient data for trends');
  }

  return lines.join('\n');
}

export function wdashJson(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)) {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const rows = queryMindfulnessDaily(db, since);
  const current = rows.length > 0 ? rows[rows.length - 1] : null;
  return { date: today, current, trend: rows };
}

export const wdashCommand = new Command('wdash')
  .description('Wellness dashboard: mindful minutes, daylight exposure, handwashing')
  .option('--days <n>', 'Trend window in days', '14')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    if (opts.json) {
      console.log(JSON.stringify(wdashJson(db, days), null, 2));
    } else {
      console.log(renderWdash(db, days));
    }
  });
