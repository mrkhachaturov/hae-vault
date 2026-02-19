import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { renderVdash } from '../src/cli/vdash.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-vdash-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target, meta) VALUES (?, ?, ?, ?, ?, 'Watch', 'me', ?)`
  );
  for (let i = 1; i <= 5; i++) {
    const d = `2020-01-0${i}`;
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'resting_heart_rate', 55 - i, 'count/min', null);
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'heart_rate_variability', 60 + i * 2, 'ms', null);
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'blood_oxygen_saturation', 97 + i * 0.1, '%', null);
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'vo2_max', 47 + i * 0.3, 'ml/(kg·min)', null);
  }
  ins.run('2020-01-05T09:00:00Z', '2020-01-05', 'blood_pressure', null, 'mmHg', '{"systolic":115,"diastolic":74}');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('renderVdash contains section headers', () => {
  const out = renderVdash(db, 30, '2020-01-05');
  assert.ok(out.includes('Vitals Dashboard'));
  assert.ok(out.includes('Current'));
  assert.ok(out.includes('Trends'));
});

test('renderVdash shows heart rate', () => {
  const out = renderVdash(db, 30, '2020-01-05');
  assert.ok(out.includes('bpm') || out.includes('HR'));
});

test('renderVdash shows blood pressure when available', () => {
  const out = renderVdash(db, 30, '2020-01-05');
  assert.ok(out.includes('115') && out.includes('74'), 'should show BP values');
});

test('renderVdash handles empty DB', () => {
  const emptyDir = join(tmpdir(), 'hae-vault-empty-vdash-' + Date.now());
  mkdirSync(emptyDir, { recursive: true });
  const emptyDb = openDb(join(emptyDir, 'test.db'));
  const out = renderVdash(emptyDb, 7, '2020-01-01');
  assert.ok(out.includes('No vitals'));
  closeDb(emptyDb);
  rmSync(emptyDir, { recursive: true });
});
