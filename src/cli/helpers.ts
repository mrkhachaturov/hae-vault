import type Database from 'better-sqlite3';

export function pad(s: string, width: number): string {
  return s.padEnd(width);
}

export function fmt1(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1);
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n).toLocaleString();
}

export function kj2kcal(kj: number | null | undefined): string {
  if (kj == null) return '—';
  return `${Math.round(kj / 4.184)} kcal`;
}

export function arrow(first: number, last: number): string {
  const delta = last - first;
  if (Math.abs(delta) < 0.01 * Math.abs(first || 1)) return '→';
  return delta > 0 ? '↑' : '↓';
}

export function ruler(label: string, width = 46): string {
  const inner = `── ${label} `;
  return inner + '─'.repeat(Math.max(0, width - inner.length));
}

export function bar(pct: number, width = 20): string {
  const filled = Math.min(width, Math.max(0, Math.round((pct / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function trendLine(
  values: number[],
  label: string,
  unit: string,
  round = false
): string {
  if (values.length < 2) return '';
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const first = values[0];
  const last = values[values.length - 1];
  const dir = arrow(first, last);
  const fmt = round ? fmtInt : fmt1;
  return `   ${pad(label + ':', 16)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

export function sinceDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function latestMetric(
  db: Database.Database,
  metricName: string,
  days = 7
): number | null {
  const since = sinceDate(days);
  const row = db.prepare(
    `SELECT qty FROM metrics WHERE metric = ? AND date >= ? AND qty IS NOT NULL ORDER BY ts DESC LIMIT 1`
  ).get(metricName, since) as { qty: number } | undefined;
  return row?.qty ?? null;
}

export function dailyAvgs(
  db: Database.Database,
  metricName: string,
  days: number
): number[] {
  const since = sinceDate(days);
  const rows = db.prepare(
    `SELECT AVG(qty) as avg_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since) as { avg_qty: number }[];
  return rows.map(r => r.avg_qty);
}

export function dailySums(
  db: Database.Database,
  metricName: string,
  days: number
): number[] {
  const since = sinceDate(days);
  const rows = db.prepare(
    `SELECT SUM(qty) as sum_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since) as { sum_qty: number }[];
  return rows.map(r => r.sum_qty);
}
