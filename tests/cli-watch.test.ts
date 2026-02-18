import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { tick } from '../src/cli/watch.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-watch-' + Date.now());
const watchDir = join(testDir, 'watch');
let db: Database.Database;

const haeJson = JSON.stringify({
  data: {
    metrics: [{ name: 'step_count', units: 'count', data: [{ date: '2026-01-10 10:00:00 +0000', qty: 5000 }] }],
    workouts: []
  }
});

before(() => {
  mkdirSync(testDir, { recursive: true });
  mkdirSync(watchDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
});

after(() => {
  closeDb(db);
  rmSync(testDir, { recursive: true });
});

test('tick imports a new HealthAutoExport-*.json file', () => {
  writeFileSync(join(watchDir, 'HealthAutoExport-test.json'), haeJson);
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);
});

test('tick skips already-imported file (dedup)', () => {
  // Same file still in dir — hash already in import_log
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1);
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
});

test('tick ignores non-HAE files', () => {
  writeFileSync(join(watchDir, 'random.txt'), 'not a health export');
  writeFileSync(join(watchDir, 'workout.gpx'), '<gpx/>');
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1); // only the HAE json counts as "found"
  assert.equal(result.imported, 0);
});

test('tick records import in import_log so second tick skips', () => {
  writeFileSync(join(watchDir, 'HealthAutoExport-new.json'), JSON.stringify({
    data: { metrics: [{ name: 'step_count', units: 'count', data: [{ date: '2026-01-11 10:00:00 +0000', qty: 6000 }] }], workouts: [] }
  }));
  tick(db, watchDir, 'default');
  // Second tick: all files should be skipped now
  const result2 = tick(db, watchDir, 'default');
  assert.equal(result2.imported, 0);
});
