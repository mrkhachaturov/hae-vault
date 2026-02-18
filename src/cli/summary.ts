import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const summaryCommand = new Command('summary')
  .description('Summarise metrics (averages) over N days')
  .option('--days <n>', 'Last N days', '90')
  .option('--pretty', 'Pretty-print JSON', false)
  .option('-c, --color', 'Pretty terminal output with emoji indicators', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const sinceStr = since.toISOString().slice(0, 10);

    if (opts.color) {
      const days = parseInt(opts.days, 10);

      function avgMetric(metricName: string): number | null {
        const row = db.prepare(
          `SELECT AVG(qty) as avg FROM metrics WHERE metric = ? AND date >= ? AND qty IS NOT NULL`
        ).get(metricName, sinceStr) as { avg: number | null } | undefined;
        return row?.avg ?? null;
      }

      const steps = avgMetric('step_count');
      const restingHR = avgMetric('resting_heart_rate');
      const hrv = avgMetric('heart_rate_variability_sdnn');
      const activeCal = avgMetric('active_energy_burned');

      const sleepRow = db.prepare(
        `SELECT AVG(asleep_h) as avg FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL`
      ).get(sinceStr) as { avg: number | null } | undefined;
      const sleep = sleepRow?.avg ?? null;

      const lines: string[] = [`📊 ${days}-Day Summary`, ''];
      if (steps != null) lines.push(`👟 Avg Steps:       ${Math.round(steps).toLocaleString()}`);
      if (restingHR != null) lines.push(`💓 Avg Resting HR:  ${Math.round(restingHR)}bpm`);
      if (hrv != null) lines.push(`🧠 Avg HRV:         ${Math.round(hrv)}ms`);
      if (sleep != null) lines.push(`😴 Avg Sleep:       ${sleep.toFixed(1)}h`);
      if (activeCal != null) lines.push(`🔥 Avg Active Cal:  ${Math.round(activeCal).toLocaleString()} kcal`);

      if (lines.length === 2) lines.push('   No summary data available');
      console.log(lines.join('\n'));
      return;
    }

    const rows = db.prepare(`
      SELECT metric, units,
             AVG(qty) as avg_qty, MIN(qty) as min_qty, MAX(qty) as max_qty,
             COUNT(*) as count,
             MIN(date) as first_date, MAX(date) as last_date
      FROM metrics
      WHERE date >= ? AND qty IS NOT NULL
      GROUP BY metric, units
      ORDER BY metric ASC
    `).all(sinceStr);
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
