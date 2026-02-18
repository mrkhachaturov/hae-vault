import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_DB_PATH = join(homedir(), '.hae-vault', 'health.db');

export function openDb(dbPath = DEFAULT_DB_PATH): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id         INTEGER PRIMARY KEY,
      ts         TEXT NOT NULL,
      date       TEXT NOT NULL,
      metric     TEXT NOT NULL,
      qty        REAL,
      min        REAL,
      avg        REAL,
      max        REAL,
      units      TEXT,
      source     TEXT,
      target     TEXT,
      meta       TEXT,
      session_id TEXT,
      UNIQUE(ts, metric, source, target)
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_date   ON metrics(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_metric ON metrics(metric);

    CREATE TABLE IF NOT EXISTS sleep (
      id            INTEGER PRIMARY KEY,
      date          TEXT NOT NULL,
      sleep_start   TEXT,
      sleep_end     TEXT,
      in_bed_start  TEXT,
      in_bed_end    TEXT,
      core_h        REAL,
      deep_h        REAL,
      rem_h         REAL,
      awake_h       REAL,
      asleep_h      REAL,
      in_bed_h      REAL,
      schema_ver    TEXT,
      source        TEXT,
      target        TEXT,
      meta          TEXT,
      session_id    TEXT,
      UNIQUE(date, source, target)
    );

    CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date);

    CREATE TABLE IF NOT EXISTS workouts (
      id            INTEGER PRIMARY KEY,
      ts            TEXT NOT NULL,
      date          TEXT NOT NULL,
      name          TEXT NOT NULL,
      duration_s    INTEGER,
      calories_kj   REAL,
      distance      REAL,
      distance_unit TEXT,
      avg_hr        REAL,
      max_hr        REAL,
      target        TEXT,
      meta          TEXT,
      session_id    TEXT,
      UNIQUE(ts, name, target)
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

    CREATE TABLE IF NOT EXISTS sync_log (
      id                INTEGER PRIMARY KEY,
      received_at       TEXT NOT NULL,
      target            TEXT,
      session_id        TEXT,
      metrics_count     INTEGER,
      workouts_count    INTEGER,
      automation_name   TEXT,
      automation_period TEXT
    );
  `);

  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
