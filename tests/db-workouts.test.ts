import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { upsertWorkout } from '../src/db/workouts.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-workouts-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const row = {
  ts: '2026-01-15T07:00:00.000Z', date: '2026-01-15',
  name: 'Running', duration_s: 2700, calories_kj: 450,
  distance: 5.2, distance_unit: 'km', avg_hr: 145, max_hr: 165,
  target: 'default', meta: '{}', session_id: 'sess-1'
};

test('inserts workout row', () => {
  upsertWorkout(db, row);
  const result = db.prepare('SELECT name FROM workouts WHERE date = ?').get('2026-01-15') as { name: string };
  assert.equal(result.name, 'Running');
});

test('upserts workout — overwrites on same ts+name+target', () => {
  upsertWorkout(db, { ...row, calories_kj: 500 });
  const count = db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number };
  assert.equal(count.c, 1);
  const updated = db.prepare('SELECT calories_kj FROM workouts WHERE date = ?').get('2026-01-15') as { calories_kj: number };
  assert.equal(updated.calories_kj, 500);
});
