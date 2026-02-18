import { Command } from 'commander';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';

function fmt1(n: number): string {
  return n.toFixed(1);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function arrow(values: number[]): string {
  if (values.length < 2) return '→';
  const half = Math.floor(values.length / 2);
  const firstHalfAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfAvg = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
  const delta = secondHalfAvg - firstHalfAvg;
  if (Math.abs(delta) < 0.01 * Math.abs(firstHalfAvg || 1)) return '→';
  return delta > 0 ? '↑' : '↓';
}

interface MetricTrendRow { date: string; avg_qty: number }

function metricTrend(
  db: ReturnType<typeof openDb>,
  metricName: string,
  since: string
): { values: number[]; avg: number; min: number; max: number } | null {
  const rows = db.prepare(
    `SELECT date, AVG(qty) as avg_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since) as MetricTrendRow[];
  if (rows.length === 0) return null;
  const values = rows.map(r => r.avg_qty);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { values, avg, min: Math.min(...values), max: Math.max(...values) };
}

function sleepTrend(
  db: ReturnType<typeof openDb>,
  since: string
): { values: number[]; avg: number; min: number; max: number } | null {
  const rows = db.prepare(
    `SELECT asleep_h FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL ORDER BY date ASC`
  ).all(since) as { asleep_h: number }[];
  if (rows.length === 0) return null;
  const values = rows.map(r => r.asleep_h);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { values, avg, min: Math.min(...values), max: Math.max(...values) };
}

export const trendsCommand = new Command('trends')
  .description('Multi-metric trend analysis with averages, ranges, and direction arrows')
  .option('--days <n>', 'Days of history', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb(config.dbPath);
    const days = parseInt(opts.days, 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const steps = metricTrend(db, 'step_count', sinceStr);
    const restingHR = metricTrend(db, 'resting_heart_rate', sinceStr);
    const hrv = metricTrend(db, 'heart_rate_variability_sdnn', sinceStr);
    const activeCal = metricTrend(db, 'active_energy_burned', sinceStr);
    const sleep = sleepTrend(db, sinceStr);

    if (opts.json) {
      console.log(JSON.stringify({ days, steps, restingHR, hrv, activeCal, sleep }, null, 2));
      return;
    }

    const lines: string[] = [];
    lines.push(`📊 ${days}-Day Trends`);
    lines.push('');

    function row(
      emoji: string,
      label: string,
      data: { values: number[]; avg: number; min: number; max: number } | null,
      unit: string,
      round: boolean
    ): void {
      if (!data) return;
      const dir = arrow(data.values);
      const fmt = round ? fmtInt : fmt1;
      lines.push(`${emoji} ${label}: ${fmt(data.avg)} avg (${fmt(data.min)}–${fmt(data.max)}) ${dir}`);
    }

    row('👟', 'Steps', steps, '', true);
    row('💓', 'Resting HR', restingHR, 'bpm', true);
    row('🧠', 'HRV', hrv, 'ms', true);
    row('😴', 'Sleep', sleep, 'h', false);
    row('🔥', 'Active Cal', activeCal, 'kcal', true);

    if (lines.length === 2) {
      lines.push('   No trend data available');
    }

    console.log(lines.join('\n'));
  });
