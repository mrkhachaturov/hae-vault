import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';
import { ruler, pad, arrow, bar, sinceDate } from './helpers.js';
import { queryNutritionDailyTotals, type NutritionDay } from './nutrition.js';
import type Database from 'better-sqlite3';

function fmtG(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n)}g`;
}

function fmtKcal(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString()} kcal`;
}

function fmtMg(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString()}mg`;
}

function trendRowNutrition(
  rows: NutritionDay[],
  label: string,
  field: keyof NutritionDay,
  unit: string
): string {
  const vals = rows.map(r => r[field] as number | null).filter((v): v is number => v != null && v > 0);
  if (vals.length < 2) return '';
  const first = vals[0];
  const last = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dir = arrow(first, last);
  const fmt = (v: number) => Math.round(v).toLocaleString();
  return `   ${pad(label + ':', 14)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function renderNdash(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)): string {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const allRows = queryNutritionDailyTotals(db, since);
  const latest = allRows.length > 0 ? allRows[allRows.length - 1] : null;

  const lines: string[] = [];
  lines.push(`📅 ${today} | 🍽️  Nutrition Dashboard`);
  lines.push('');

  // ── Today's Macros ─────────────────────────────────────────────────────────
  lines.push(ruler("Today's Macros"));
  if (latest) {
    const note = latest.date !== today ? `  (latest: ${latest.date})` : '';
    lines.push(`🍽️  ${fmtKcal(latest.kcal)}${note}`);
    lines.push(`   🥩 Protein: ${fmtG(latest.protein_g)}  |  🍞 Carbs: ${fmtG(latest.carbs_g)}  |  🫒 Fat: ${fmtG(latest.fat_g)}`);
    lines.push(`   🌿 Fiber: ${fmtG(latest.fiber_g)}  |  🍬 Sugar: ${fmtG(latest.sugar_g)}  |  🧂 Sodium: ${fmtMg(latest.sodium_mg)}  |  💊 Cholesterol: ${fmtMg(latest.cholesterol_mg)}`);
  } else {
    lines.push('   No nutrition data');
  }
  lines.push('');

  // ── Macro Split ────────────────────────────────────────────────────────────
  lines.push(ruler('Macro Split (% of calories)'));
  if (latest?.protein_g != null && latest.carbs_g != null && latest.fat_g != null) {
    const protKcal = latest.protein_g * 4;
    const carbKcal = latest.carbs_g * 4;
    const fatKcal = latest.fat_g * 9;
    const total = protKcal + carbKcal + fatKcal;
    if (total > 0) {
      const protPct = Math.round((protKcal / total) * 100);
      const carbPct = Math.round((carbKcal / total) * 100);
      const fatPct = 100 - protPct - carbPct;
      lines.push(`   🥩 Protein  ${bar(protPct)}  ${String(protPct).padStart(2)}%   ${fmtG(latest.protein_g)}`);
      lines.push(`   🍞 Carbs    ${bar(carbPct)}  ${String(carbPct).padStart(2)}%   ${fmtG(latest.carbs_g)}`);
      lines.push(`   🫒 Fat      ${bar(fatPct)}  ${String(fatPct).padStart(2)}%   ${fmtG(latest.fat_g)}`);
    } else {
      lines.push('   No macro data');
    }
  } else {
    lines.push('   Insufficient macro data');
  }
  lines.push('');

  // ── Trends ─────────────────────────────────────────────────────────────────
  lines.push(ruler(`${days}-Day Trends`));
  const trendLines = [
    trendRowNutrition(allRows, 'Calories', 'kcal', ' kcal'),
    trendRowNutrition(allRows, 'Protein', 'protein_g', 'g'),
    trendRowNutrition(allRows, 'Carbs', 'carbs_g', 'g'),
    trendRowNutrition(allRows, 'Fat', 'fat_g', 'g'),
    trendRowNutrition(allRows, 'Fiber', 'fiber_g', 'g'),
    trendRowNutrition(allRows, 'Sugar', 'sugar_g', 'g'),
    trendRowNutrition(allRows, 'Sodium', 'sodium_mg', 'mg'),
  ].filter(Boolean);
  if (trendLines.length > 0) {
    lines.push(...trendLines);
  } else {
    lines.push('   Insufficient data for trends');
  }

  return lines.join('\n');
}

export function ndashJson(db: Database.Database, days: number, today = new Date().toISOString().slice(0, 10)) {
  const sinceD = new Date(today);
  sinceD.setDate(sinceD.getDate() - days);
  const since = sinceD.toISOString().slice(0, 10);
  const rows = queryNutritionDailyTotals(db, since);
  const latest = rows.length > 0 ? rows[rows.length - 1] : null;
  return { date: today, latest, trend: rows };
}

export const ndashCommand = new Command('ndash')
  .description('Nutrition terminal dashboard: macros, split, trends')
  .option('--days <n>', 'Trend window in days', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    if (opts.json) {
      console.log(JSON.stringify(ndashJson(db, days), null, 2));
    } else {
      console.log(renderNdash(db, days));
    }
  });
