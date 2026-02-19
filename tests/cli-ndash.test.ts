import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { renderNdash, ndashJson } from '../src/cli/ndash.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-ndash-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'dietary_energy', 8368, 'kJ');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'protein', 150, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'carbohydrates', 200, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'total_fat', 80, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'fiber', 25, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'dietary_sugar', 50, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'sodium', 2000, 'mg');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'cholesterol', 300, 'mg');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'dietary_energy', 9211, 'kJ');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'protein', 160, 'g');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'carbohydrates', 210, 'g');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'total_fat', 85, 'g');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('renderNdash contains section headers', () => {
  const out = renderNdash(db, 30, '2020-01-02');
  assert.ok(out.includes("Today's Macros"), 'should include macros header');
  assert.ok(out.includes('Macro Split'), 'should include macro split header');
  assert.ok(out.includes('Trends'), 'should include trends header');
});

test('renderNdash shows kcal', () => {
  const out = renderNdash(db, 30, '2020-01-02');
  assert.ok(out.includes('kcal'), 'should display kcal');
});

test('renderNdash shows macro bars', () => {
  const out = renderNdash(db, 30, '2020-01-02');
  assert.ok(out.includes('█'), 'should display bar chart');
  assert.ok(out.includes('%'), 'should display percentages');
});

test('renderNdash shows trend arrows when 2+ days', () => {
  const out = renderNdash(db, 30, '2020-01-02');
  assert.ok(out.match(/[↑↓→]/), 'should show trend arrow');
});

test('renderNdash handles empty DB gracefully', () => {
  const emptyDir = join(tmpdir(), 'hae-vault-empty-' + Date.now());
  mkdirSync(emptyDir, { recursive: true });
  const emptyDb = openDb(join(emptyDir, 'test.db'));
  const out = renderNdash(emptyDb, 7, '2020-01-01');
  assert.ok(out.includes('No nutrition data'));
  closeDb(emptyDb);
  rmSync(emptyDir, { recursive: true });
});

test('ndashJson returns structured object', () => {
  const result = ndashJson(db, 30, '2020-01-02');
  assert.ok(result.latest !== null);
  assert.ok(Array.isArray(result.trend));
});
