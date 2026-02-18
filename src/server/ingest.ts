import type Database from 'better-sqlite3';
import type { HaePayload, SleepDatapoint } from '../types/hae.js';
import { parseMetric } from '../parse/metrics.js';
import { normalizeSleep } from '../parse/sleep.js';
import { parseWorkout } from '../parse/workouts.js';
import { upsertMetrics } from '../db/metrics.js';
import { upsertSleep } from '../db/sleep.js';
import { upsertWorkout } from '../db/workouts.js';

export interface IngestOptions {
  target: string;
  sessionId: string | null;
  automationName?: string;
  automationPeriod?: string;
}

export interface IngestResult {
  metricsAdded: number;
  sleepAdded: number;
  workoutsAdded: number;
}

export function ingest(db: Database.Database, payload: HaePayload, opts: IngestOptions): IngestResult {
  const { target, sessionId } = opts;
  const { data } = payload;

  let metricsAdded = 0;
  let sleepAdded = 0;
  let workoutsAdded = 0;

  // Process metrics
  for (const m of data.metrics ?? []) {
    if (m.name === 'sleep_analysis') {
      for (const dp of (m.data as SleepDatapoint[])) {
        const row = normalizeSleep(dp, target, sessionId);
        upsertSleep(db, row);
        sleepAdded++;
      }
    } else {
      const rows = parseMetric(m, target, sessionId);
      upsertMetrics(db, rows);
      metricsAdded += rows.length;
    }
  }

  // Process workouts
  for (const w of data.workouts ?? []) {
    const row = parseWorkout(w, target, sessionId);
    upsertWorkout(db, row);
    workoutsAdded++;
  }

  // Log sync
  db.prepare(`
    INSERT INTO sync_log (received_at, target, session_id, metrics_count, workouts_count, automation_name, automation_period)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    target,
    sessionId,
    metricsAdded,
    workoutsAdded,
    opts.automationName ?? null,
    opts.automationPeriod ?? null,
  );

  return { metricsAdded, sleepAdded, workoutsAdded };
}
