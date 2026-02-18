import type Database from 'better-sqlite3';
import type { IngestResult } from '../server/ingest.js';

export function hasBeenImported(db: Database.Database, hash: string): boolean {
  return db.prepare('SELECT id FROM import_log WHERE file_hash = ?').get(hash) !== undefined;
}

export function logImport(
  db: Database.Database,
  filename: string,
  hash: string,
  result: IngestResult,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO import_log (filename, file_hash, imported_at, metrics_added, sleep_added, workouts_added)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(filename, hash, new Date().toISOString(), result.metricsAdded, result.sleepAdded, result.workoutsAdded);
}
