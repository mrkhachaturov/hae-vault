import type Database from 'better-sqlite3';
import type { NormalizedWorkout } from '../parse/workouts.js';

export function upsertWorkout(db: Database.Database, row: NormalizedWorkout): void {
  db.prepare(`
    INSERT OR REPLACE INTO workouts
      (ts, date, name, duration_s, calories_kj, distance, distance_unit,
       avg_hr, max_hr, target, meta, session_id)
    VALUES
      (@ts, @date, @name, @duration_s, @calories_kj, @distance, @distance_unit,
       @avg_hr, @max_hr, @target, @meta, @session_id)
  `).run(row);
}
