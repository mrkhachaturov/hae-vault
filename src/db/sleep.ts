import type Database from 'better-sqlite3';
import type { NormalizedSleep } from '../parse/sleep.js';

export function upsertSleep(db: Database.Database, row: NormalizedSleep): void {
  db.prepare(`
    INSERT OR REPLACE INTO sleep
      (date, sleep_start, sleep_end, in_bed_start, in_bed_end,
       core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h,
       schema_ver, source, target, meta, session_id)
    VALUES
      (@date, @sleep_start, @sleep_end, @in_bed_start, @in_bed_end,
       @core_h, @deep_h, @rem_h, @awake_h, @asleep_h, @in_bed_h,
       @schema_ver, @source, @target, @meta, @session_id)
  `).run(row);
}
