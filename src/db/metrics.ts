import type Database from 'better-sqlite3';
import type { NormalizedMetric } from '../parse/metrics.js';

export function upsertMetrics(db: Database.Database, rows: NormalizedMetric[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO metrics
      (ts, date, metric, qty, min, avg, max, units, source, target, meta, session_id)
    VALUES
      (@ts, @date, @metric, @qty, @min, @avg, @max, @units, @source, @target, @meta, @session_id)
  `);
  const insertMany = db.transaction((rows: NormalizedMetric[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(rows);
}
