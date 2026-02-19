import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { renderWdash } from '../src/cli/wdash.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-wdash-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  for (let i = 1; i <= 5; i++) {
    const d = `2020-01-0${i}`;
    ins.run(`2020-01-0${i}T07:00:00Z`, d, 'mindful_minutes', 8 + i, 'min');
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'handwashing', 25, 's');
    ins.run(`2020-01-0${i}T09:00:00Z`, d, 'handwashing', 22, 's');
    ins.run(`2020-01-0${i}T12:00:00Z`, d, 'time_in_daylight', 30 + i * 3, 'min');
  }
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('renderWdash contains Wellness Dashboard header', () => {
  const out = renderWdash(db, 14, '2020-01-05');
  assert.ok(out.includes('Wellness Dashboard'));
});

test('renderWdash shows mindfulness minutes', () => {
  const out = renderWdash(db, 14, '2020-01-05');
  assert.ok(out.includes('min') || out.includes('Mindful'));
});

test('renderWdash shows trend arrows', () => {
  const out = renderWdash(db, 14, '2020-01-05');
  assert.ok(out.match(/[↑↓→]/));
});

test('renderWdash handles empty DB', () => {
  const emptyDir = join(tmpdir(), 'hae-vault-empty-wdash-' + Date.now());
  mkdirSync(emptyDir, { recursive: true });
  const emptyDb = openDb(join(emptyDir, 'test.db'));
  const out = renderWdash(emptyDb, 14, '2020-01-01');
  assert.ok(out.includes('No wellness'));
  closeDb(emptyDb);
  rmSync(emptyDir, { recursive: true });
});
