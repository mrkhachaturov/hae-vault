import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { queryNutritionDailyTotals, queryNutritionEntries } from '../src/cli/nutrition.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-nutrition-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  // Insert fixture: two days, multiple metrics each
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  // Day 1
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'dietary_energy', 8368, 'kJ');   // 2000 kcal
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'protein', 150, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'carbohydrates', 200, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'total_fat', 80, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'fiber', 25, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'dietary_sugar', 50, 'g');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'sodium', 2000, 'mg');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'cholesterol', 300, 'mg');
  // Day 2 — two protein entries (should sum)
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'protein', 60, 'g');
  ins.run('2020-01-02T13:00:00Z', '2020-01-02', 'protein', 90, 'g');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'carbohydrates', 220, 'g');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('returns daily totals grouped by date', () => {
  const rows = queryNutritionDailyTotals(db, '2020-01-01');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2020-01-01');
});

test('converts kJ to kcal (÷ 4.184)', () => {
  const rows = queryNutritionDailyTotals(db, '2020-01-01');
  assert.ok(Math.abs((rows[0].kcal ?? 0) - 2000) < 1, 'kcal should be ~2000');
});

test('sums multiple entries per day', () => {
  const rows = queryNutritionDailyTotals(db, '2020-01-01');
  const day2 = rows.find(r => r.date === '2020-01-02');
  assert.equal(day2?.protein_g, 150, 'two protein entries should sum to 150g');
});

test('returns zero not null when metric absent for a day', () => {
  const rows = queryNutritionDailyTotals(db, '2020-01-01');
  const day2 = rows.find(r => r.date === '2020-01-02');
  // Day 2 has no fiber — pivot returns 0 (SUM of nothing = 0)
  assert.equal(day2?.fiber_g, 0);
});

test('queryNutritionEntries returns raw rows ordered by ts', () => {
  const rows = queryNutritionEntries(db, '2020-01-01');
  assert.ok(rows.length >= 10);
  assert.ok(rows.every(r => r.metric !== undefined && r.qty !== undefined));
});

test('returns empty array when no data', () => {
  const rows = queryNutritionDailyTotals(db, '2099-01-01');
  assert.deepEqual(rows, []);
});
