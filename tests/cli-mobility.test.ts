import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { queryMobilityDaily } from '../src/cli/mobility.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-mobility-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'Watch', 'me')`
  );
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'walking_speed', 5.1, 'km/hr');
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'walking_step_length', 73.5, 'cm');
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'walking_asymmetry_percentage', 3.2, '%');
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'walking_double_support_percentage', 25.1, '%');
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'stair_speed_up', 0.61, 'm/s');
  ins.run('2020-01-01T10:00:00Z', '2020-01-01', 'stair_speed_down', 0.53, 'm/s');
  ins.run('2020-01-02T10:00:00Z', '2020-01-02', 'walking_speed', 5.3, 'km/hr');
  ins.run('2020-01-02T10:00:00Z', '2020-01-02', 'walking_step_length', 74.2, 'cm');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('returns one row per day', () => {
  const rows = queryMobilityDaily(db, '2020-01-01');
  assert.equal(rows.length, 2);
});

test('returns correct walking speed', () => {
  const rows = queryMobilityDaily(db, '2020-01-01');
  assert.equal(rows[0].walking_speed_kmh, 5.1);
});

test('returns null for missing metrics', () => {
  const rows = queryMobilityDaily(db, '2020-01-01');
  const day2 = rows.find(r => r.date === '2020-01-02');
  assert.equal(day2?.stair_speed_up_ms, null);
  assert.equal(day2?.six_min_walk_m, null);
});

test('returns empty array when no data', () => {
  assert.deepEqual(queryMobilityDaily(db, '2099-01-01'), []);
});
