import { Command } from 'commander';
import { openDb } from '../db/schema.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

function fmt1(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n).toLocaleString();
}

function sec2min(s: number | null | undefined): string {
  if (s == null) return '—';
  return `${Math.round(s / 60)}min`;
}

function kj2kcal(kj: number | null | undefined): string {
  if (kj == null) return '—';
  return `${Math.round(kj / 4.184)} kcal`;
}

function arrow(first: number, last: number): string {
  const delta = last - first;
  if (Math.abs(delta) < 0.01 * Math.abs(first || 1)) return '→';
  return delta > 0 ? '↑' : '↓';
}

function ruler(label: string, width = 43): string {
  const inner = `── ${label} `;
  return inner + '─'.repeat(Math.max(0, width - inner.length));
}

function workoutEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('run')) return '🏃';
  if (n.includes('walk')) return '🚶';
  if (n.includes('cycl') || n.includes('bike')) return '🚴';
  if (n.includes('swim')) return '🏊';
  if (n.includes('yoga')) return '🧘';
  if (n.includes('strength') || n.includes('weight') || n.includes('lift')) return '🏋️';
  if (n.includes('hike')) return '🥾';
  return '🏅';
}

function latestMetric(
  db: ReturnType<typeof openDb>,
  metricName: string,
  days = 7
): number | null {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const row = db.prepare(
    `SELECT qty FROM metrics WHERE metric = ? AND date >= ? AND qty IS NOT NULL ORDER BY ts DESC LIMIT 1`
  ).get(metricName, since.toISOString().slice(0, 10)) as { qty: number } | undefined;
  return row?.qty ?? null;
}

function dailyAvgs(
  db: ReturnType<typeof openDb>,
  metricName: string,
  days: number
): number[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.prepare(
    `SELECT date, AVG(qty) as avg_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since.toISOString().slice(0, 10)) as { date: string; avg_qty: number }[];
  return rows.map(r => r.avg_qty);
}

function sleepDailyAvgs(
  db: ReturnType<typeof openDb>,
  days: number
): number[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.prepare(
    `SELECT asleep_h FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL ORDER BY date ASC`
  ).all(since.toISOString().slice(0, 10)) as { asleep_h: number }[];
  return rows.map(r => r.asleep_h);
}

function trendLine(
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
  return `   ${pad(label + ':', 14)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

// ── command ───────────────────────────────────────────────────────────────────

export const dashboardCommand = new Command('dashboard')
  .description('Terminal dashboard: sleep, activity, heart health, workouts, trends')
  .option('--days <n>', 'Trend window in days', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb();
    const trendDays = parseInt(opts.days, 10);
    const today = new Date().toISOString().slice(0, 10);

    // ── sleep (last night) ─────────────────────────────────────────────────
    const sleep = db.prepare(
      `SELECT * FROM sleep ORDER BY date DESC LIMIT 1`
    ).get() as {
      date: string; asleep_h: number | null; in_bed_h: number | null;
      deep_h: number | null; rem_h: number | null; awake_h: number | null;
      source: string | null;
    } | undefined;

    // ── activity (today, fallback last 2 days) ─────────────────────────────
    const steps = latestMetric(db, 'step_count', 2);
    const activeCal = latestMetric(db, 'active_energy_burned', 2);
    const standHours = latestMetric(db, 'apple_stand_hour', 2);

    // ── heart health (last 7 days) ─────────────────────────────────────────
    const restingHR = latestMetric(db, 'resting_heart_rate', 7);
    const hrv = latestMetric(db, 'heart_rate_variability_sdnn', 7);

    // ── recent workouts ────────────────────────────────────────────────────
    const workouts = db.prepare(
      `SELECT date, name, duration_s, calories_kj, avg_hr FROM workouts ORDER BY ts DESC LIMIT 5`
    ).all() as { date: string; name: string; duration_s: number | null; calories_kj: number | null; avg_hr: number | null }[];

    // ── trends ────────────────────────────────────────────────────────────
    const stepTrend = dailyAvgs(db, 'step_count', trendDays);
    const hrTrend = dailyAvgs(db, 'resting_heart_rate', trendDays);
    const hrvTrend = dailyAvgs(db, 'heart_rate_variability_sdnn', trendDays);
    const sleepTrend = sleepDailyAvgs(db, trendDays);

    // ── vault stats ───────────────────────────────────────────────────────
    const metricsCount = (db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number }).c;
    const sleepCount = (db.prepare('SELECT COUNT(*) as c FROM sleep').get() as { c: number }).c;
    const workoutsCount = (db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number }).c;
    const lastSync = db.prepare('SELECT received_at FROM sync_log ORDER BY received_at DESC LIMIT 1').get() as { received_at: string } | undefined;

    if (opts.json) {
      console.log(JSON.stringify({
        date: today,
        sleep: sleep ?? null,
        activity: { steps, activeCal, standHours },
        heartHealth: { restingHR, hrv },
        workouts,
        trends: { steps: stepTrend, restingHR: hrTrend, hrv: hrvTrend, sleep: sleepTrend },
        vault: { metricsCount, sleepCount, workoutsCount, lastSync: lastSync?.received_at ?? null }
      }, null, 2));
      return;
    }

    const lines: string[] = [];
    lines.push(`📅 ${today} | Apple Health Vault`);
    lines.push('');

    // sleep
    lines.push(ruler('Sleep (last night)'));
    if (sleep) {
      const eff = sleep.in_bed_h && sleep.asleep_h
        ? Math.round((sleep.asleep_h / sleep.in_bed_h) * 100) : null;
      lines.push(`😴 ${fmt1(sleep.asleep_h)}h | Efficiency: ${eff != null ? eff + '%' : '—'}`);
      const light = (sleep.asleep_h ?? 0) - (sleep.deep_h ?? 0) - (sleep.rem_h ?? 0);
      const deepPct = sleep.asleep_h ? Math.round(((sleep.deep_h ?? 0) / sleep.asleep_h) * 100) : 0;
      const remPct = sleep.asleep_h ? Math.round(((sleep.rem_h ?? 0) / sleep.asleep_h) * 100) : 0;
      const lightPct = sleep.asleep_h ? Math.round((light / sleep.asleep_h) * 100) : 0;
      lines.push(`   Deep: ${fmt1(sleep.deep_h)}h (${deepPct}%) | REM: ${fmt1(sleep.rem_h)}h (${remPct}%) | Light: ${fmt1(light)}h (${lightPct}%)`);
      lines.push(`   Awake: ${fmt1(sleep.awake_h)}h | Source: ${sleep.source ?? '—'}`);
    } else {
      lines.push('   No sleep data');
    }
    lines.push('');

    // activity
    lines.push(ruler('Activity (recent)'));
    const actParts: string[] = [];
    if (steps != null) actParts.push(`👟 ${fmtInt(steps)} steps`);
    if (activeCal != null) actParts.push(`🔥 ${fmtInt(activeCal)} kcal active`);
    if (actParts.length > 0) {
      lines.push(actParts.join(' | '));
      if (standHours != null) lines.push(`   Stand hours: ${Math.round(standHours)}`);
    } else {
      lines.push('   No activity data');
    }
    lines.push('');

    // heart health
    lines.push(ruler('Heart Health'));
    const hh: string[] = [];
    if (restingHR != null) hh.push(`💓 Resting HR: ${Math.round(restingHR)}bpm`);
    if (hrv != null) hh.push(`HRV: ${Math.round(hrv)}ms`);
    lines.push(hh.length > 0 ? hh.join(' | ') : '   No heart data');
    lines.push('');

    // workouts
    lines.push(ruler('Recent Workouts'));
    if (workouts.length > 0) {
      for (const w of workouts) {
        const emoji = workoutEmoji(w.name);
        const namePadded = pad(w.name, 18);
        const dur = sec2min(w.duration_s);
        const cal = kj2kcal(w.calories_kj);
        lines.push(`${emoji} ${w.date}  ${namePadded} ${dur}  ${cal}`);
      }
    } else {
      lines.push('   No workout data');
    }
    lines.push('');

    // trends
    lines.push(ruler(`${trendDays}-Day Trends`));
    const tl: string[] = [
      trendLine(stepTrend, 'Steps', '', true),
      trendLine(sleepTrend, 'Sleep', 'h'),
      trendLine(hrTrend, 'Resting HR', 'bpm', true),
      trendLine(hrvTrend, 'HRV', 'ms', true),
    ].filter(Boolean);
    if (tl.length > 0) lines.push(...tl);
    else lines.push('   Insufficient data for trends');
    lines.push('');

    // vault stats
    lines.push(ruler('Vault Stats'));
    lines.push(`   Metrics: ${metricsCount.toLocaleString()} | Sleep: ${sleepCount} | Workouts: ${workoutsCount}`);
    lines.push(`   Last sync: ${lastSync?.received_at ? new Date(lastSync.received_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never'}`);

    console.log(lines.join('\n'));
  });
