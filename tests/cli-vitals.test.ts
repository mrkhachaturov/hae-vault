import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { queryVitalsDaily } from '../src/cli/vitals.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-vitals-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, min, avg, max, units, source, target, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Watch', 'me', ?)`
  );
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'resting_heart_rate', 52, null, null, null, 'count/min', null);
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'heart_rate_variability', 68, null, null, null, 'ms', null);
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'blood_oxygen_saturation', 97.2, null, null, null, '%', null);
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'vo2_max', 48.3, null, null, null, 'ml/(kg·min)', null);
  ins.run('2020-01-01T09:00:00Z', '2020-01-01', 'blood_pressure', null, null, null, null, 'mmHg', '{"systolic":118,"diastolic":76}');
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'resting_heart_rate', 50, null, null, null, 'count/min', null);
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'heart_rate_variability', 72, null, null, null, 'ms', null);
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('returns one row per day', () => {
  const rows = queryVitalsDaily(db, '2020-01-01');
  assert.equal(rows.length, 2);
});

test('parses resting HR correctly', () => {
  const rows = queryVitalsDaily(db, '2020-01-01');
  assert.equal(rows[0].resting_hr_bpm, 52);
});

test('parses HRV correctly', () => {
  const rows = queryVitalsDaily(db, '2020-01-01');
  assert.equal(rows[0].hrv_ms, 68);
});

test('parses blood pressure from meta JSON', () => {
  const rows = queryVitalsDaily(db, '2020-01-01');
  assert.equal(rows[0].systolic_mmhg, 118);
  assert.equal(rows[0].diastolic_mmhg, 76);
});

test('returns null for missing metrics', () => {
  const rows = queryVitalsDaily(db, '2020-01-01');
  assert.equal(rows[1].spo2_pct, null);
});

test('returns empty array when no data', () => {
  assert.deepEqual(queryVitalsDaily(db, '2099-01-01'), []);
});
