import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { ingest } from '../src/server/ingest.js';
import type Database from 'better-sqlite3';
import type { HaePayload } from '../src/types/hae.js';

const testDir = join(tmpdir(), 'hae-vault-test-ingest-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const payload: HaePayload = {
  data: {
    metrics: [
      { name: 'step_count', units: 'count', data: [{ date: '2026-01-15 10:00:00 +0000', qty: 8532 }] },
      { name: 'heart_rate', units: 'bpm', data: [{ date: '2026-01-15 10:00:00 +0000', Min: 55, Avg: 72, Max: 130 }] },
      {
        name: 'sleep_analysis', units: 'hr',
        data: [{
          sleepStart: '2026-01-14 22:00:00 +0000',
          sleepEnd: '2026-01-15 06:00:00 +0000',
          core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0,
          source: 'Apple Watch'
        }]
      }
    ],
    workouts: [
      { name: 'Running', start: '2026-01-15 07:00:00 +0000', end: '2026-01-15 07:45:00 +0000', activeEnergyBurned: { qty: 450, units: 'kJ' } }
    ]
  }
};

test('ingests metrics into DB', () => {
  ingest(db, payload, { target: 'default', sessionId: 'sess-1', automationName: 'morning', automationPeriod: 'Today' });
  const count = db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number };
  assert.ok(count.c >= 2);
});

test('ingests sleep into DB', () => {
  const row = db.prepare('SELECT * FROM sleep WHERE date = ?').get('2026-01-14') as { core_h: number } | undefined;
  assert.ok(row);
  assert.equal(row!.core_h, 3.0);
});

test('ingests workout into DB', () => {
  const row = db.prepare("SELECT * FROM workouts WHERE name = 'Running'").get() as { calories_kj: number } | undefined;
  assert.ok(row);
  assert.equal(row!.calories_kj, 450);
});

test('writes to sync_log', () => {
  const row = db.prepare('SELECT * FROM sync_log WHERE session_id = ?').get('sess-1') as { metrics_count: number } | undefined;
  assert.ok(row);
  assert.ok(row!.metrics_count >= 2);
});

test('second ingest with same data is idempotent — no duplicates', () => {
  ingest(db, payload, { target: 'default', sessionId: 'sess-2', automationName: 'morning', automationPeriod: 'Today' });
  const metricsCount = db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number };
  const sleepCount = db.prepare('SELECT COUNT(*) as c FROM sleep').get() as { c: number };
  const workoutsCount = db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number };
  // Upsert should not create duplicates — same data for same timestamps
  assert.ok(metricsCount.c >= 2);
  assert.equal(sleepCount.c, 1);
  assert.equal(workoutsCount.c, 1);
});

test('ingest returns IngestResult with counts', () => {
  const freshPayload: HaePayload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ date: '2026-02-01 10:00:00 +0000', qty: 1000 }] },
        {
          name: 'sleep_analysis', units: 'hr',
          data: [{
            sleepStart: '2026-02-01 22:00:00 +0000',
            sleepEnd: '2026-02-02 06:00:00 +0000',
            core: 2.0, deep: 1.0, rem: 1.0, awake: 0.2, asleep: 4.0, inBed: 4.5,
            source: 'Apple Watch'
          }]
        }
      ],
      workouts: [
        { name: 'Cycling', start: '2026-02-01 07:00:00 +0000', end: '2026-02-01 08:00:00 +0000' }
      ]
    }
  };
  const result = ingest(db, freshPayload, { target: 'test', sessionId: 'sess-count', automationName: 'test', automationPeriod: 'manual' });
  assert.ok(typeof result.metricsAdded === 'number');
  assert.ok(typeof result.sleepAdded === 'number');
  assert.ok(typeof result.workoutsAdded === 'number');
  assert.equal(result.metricsAdded, 1);   // step_count only (sleep goes to sleep table)
  assert.equal(result.sleepAdded, 1);
  assert.equal(result.workoutsAdded, 1);
});
