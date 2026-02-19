import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { renderBdash, bdashJson } from '../src/cli/bdash.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-bdash-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  for (let i = 1; i <= 5; i++) {
    const d = `2020-01-0${i}`;
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'weight_body_mass', 82 - i * 0.2, 'kg');
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'body_fat_percentage', 19.5 - i * 0.1, '%');
    ins.run(`2020-01-0${i}T08:00:00Z`, d, 'body_mass_index', 25.0 - i * 0.05, 'count');
  }
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('renderBdash contains section headers', () => {
  const out = renderBdash(db, 30, '2020-01-05');
  assert.ok(out.includes('Current'), 'should have Current section');
  assert.ok(out.includes('Trends'), 'should have Trends section');
});

test('renderBdash shows weight with kg unit', () => {
  const out = renderBdash(db, 30, '2020-01-05');
  assert.ok(out.includes('kg'), 'should show kg');
});

test('renderBdash shows trend arrow', () => {
  const out = renderBdash(db, 30, '2020-01-05');
  assert.ok(out.match(/[↑↓→]/), 'should have trend direction');
});

test('renderBdash handles empty DB', () => {
  const emptyDir = join(tmpdir(), 'hae-vault-empty-bdash-' + Date.now());
  mkdirSync(emptyDir, { recursive: true });
  const emptyDb = openDb(join(emptyDir, 'test.db'));
  const out = renderBdash(emptyDb, 30, '2020-01-01');
  assert.ok(out.includes('No body'));
  closeDb(emptyDb);
  rmSync(emptyDir, { recursive: true });
});

test('bdashJson returns structured object', () => {
  const result = bdashJson(db, 30, '2020-01-05');
  assert.ok(result.current !== null);
  assert.ok(Array.isArray(result.trend));
});
