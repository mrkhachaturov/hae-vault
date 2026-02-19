import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { queryBodyDailyReadings } from '../src/cli/body.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-body-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'weight_body_mass', 80.5, 'kg');
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'body_mass_index', 24.5, 'count');
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'body_fat_percentage', 18.2, '%');
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'weight_body_mass', 80.1, 'kg');
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'body_mass_index', 24.4, 'count');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('returns one row per day', () => {
  const rows = queryBodyDailyReadings(db, '2020-01-01');
  assert.equal(rows.length, 2);
});

test('returns correct weight', () => {
  const rows = queryBodyDailyReadings(db, '2020-01-01');
  assert.equal(rows[0].weight_kg, 80.5);
});

test('returns null for missing metrics on a day', () => {
  const rows = queryBodyDailyReadings(db, '2020-01-01');
  const day2 = rows.find(r => r.date === '2020-01-02');
  assert.equal(day2?.body_fat_pct, null);
  assert.equal(day2?.lean_mass_kg, null);
});

test('returns empty array when no data', () => {
  assert.deepEqual(queryBodyDailyReadings(db, '2099-01-01'), []);
});
