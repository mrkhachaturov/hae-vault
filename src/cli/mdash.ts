import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { ruler, pad, arrow, sinceDate } from './helpers.js';
import { queryMobilityDaily, type MobilityDay } from './mobility.js';
import type Database from 'better-sqlite3';

function trendRowMobility(rows: MobilityDay[], label: string, field: keyof MobilityDay, unit: string, decimals = 1, invertArrow = false): string {
  const vals = rows.map(r => r[field] as number | null).filter((v): v is number => v != null);
  if (vals.length < 2) return '';
  const first = vals[0];
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // For asymmetry & double support: lower = better, so invert the display arrow
  const rawDir = arrow(first, last);
  const dir = invertArrow
    ? (rawDir === '↑' ? '↑ (worse)' : rawDir === '↓' ? '↓ (better)' : '→')
    : rawDir;
  const fmt = (v: number) => v.toFixed(decimals);
  return `   ${pad(label + ':', 20)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function renderMdash(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)): string {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const allRows = queryMobilityDaily(db, since);
  const latest = allRows.length > 0 ? allRows[allRows.length - 1] : null;

  const lines: string[] = [];
  lines.push(`📅 ${today} | 🚶 Mobility Dashboard`);
  lines.push('');

  // ── Current ────────────────────────────────────────────────────────────────
  lines.push(ruler('Current'));
  if (latest) {
    const note = latest.date !== today ? `  (latest: ${latest.date})` : '';
    const spd = latest.walking_speed_kmh != null ? `🚶 Speed: ${latest.walking_speed_kmh.toFixed(1)} km/h` : '🚶 Speed: —';
    const sl  = latest.step_length_cm != null ? `Step: ${Math.round(latest.step_length_cm)}cm` : 'Step: —';
    const asy = latest.asymmetry_pct != null ? `Asym: ${latest.asymmetry_pct.toFixed(1)}%` : 'Asym: —';
    lines.push(`${spd}  |  📐 ${sl}  |  ⚖️  ${asy}${note}`);

    const row2: string[] = [];
    if (latest.double_support_pct != null) row2.push(`Double support: ${latest.double_support_pct.toFixed(1)}%`);
    if (latest.stair_speed_up_ms != null) row2.push(`🪜 Stair up: ${latest.stair_speed_up_ms.toFixed(2)}m/s`);
    if (latest.stair_speed_down_ms != null) row2.push(`Stair down: ${latest.stair_speed_down_ms.toFixed(2)}m/s`);
    if (latest.six_min_walk_m != null) row2.push(`6-min walk: ${Math.round(latest.six_min_walk_m)}m`);
    if (row2.length > 0) lines.push(`   ${row2.join('  |  ')}`);
  } else {
    lines.push('   No mobility data');
  }
  lines.push('');

  // ── Trends ─────────────────────────────────────────────────────────────────
  lines.push(ruler(`${days}-Day Trends`));
  const trendLines = [
    trendRowMobility(allRows, 'Walking speed', 'walking_speed_kmh', ' km/h', 1, false),
    trendRowMobility(allRows, 'Step length', 'step_length_cm', 'cm', 1, false),
    trendRowMobility(allRows, 'Asymmetry', 'asymmetry_pct', '%', 1, true),
    trendRowMobility(allRows, 'Double support', 'double_support_pct', '%', 1, true),
    trendRowMobility(allRows, 'Stair speed up', 'stair_speed_up_ms', ' m/s', 2, false),
    trendRowMobility(allRows, 'Stair speed down', 'stair_speed_down_ms', ' m/s', 2, false),
  ].filter(Boolean);
  if (trendLines.length > 0) {
    lines.push(...trendLines);
  } else {
    lines.push('   Insufficient data for trends');
  }

  return lines.join('\n');
}

export function mdashJson(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)) {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const rows = queryMobilityDaily(db, since);
  const current = rows.length > 0 ? rows[rows.length - 1] : null;
  return { date: today, current, trend: rows };
}

export const mdashCommand = new Command('mdash')
  .description('Mobility dashboard: walking speed, gait symmetry, stair speed, step length')
  .option('--days <n>', 'Trend window in days', '14')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    if (opts.json) {
      console.log(JSON.stringify(mdashJson(db, days), null, 2));
    } else {
      console.log(renderMdash(db, days));
    }
  });
