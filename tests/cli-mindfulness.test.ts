import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { queryMindfulnessDaily } from '../src/cli/mindfulness.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-mindfulness-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'App', 'me')`
  );
  // Day 1: two mindful sessions, three handwash events, some daylight
  ins.run('2020-01-01T07:00:00Z', '2020-01-01', 'mindful_minutes', 10, 'min');
  ins.run('2020-01-01T19:00:00Z', '2020-01-01', 'mindful_minutes', 5, 'min');
  ins.run('2020-01-01T08:00:00Z', '2020-01-01', 'handwashing', 25, 's');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'handwashing', 22, 's');
  ins.run('2020-01-01T18:00:00Z', '2020-01-01', 'handwashing', 28, 's');
  ins.run('2020-01-01T12:00:00Z', '2020-01-01', 'time_in_daylight', 42, 'min');
  // Day 2
  ins.run('2020-01-02T08:00:00Z', '2020-01-02', 'mindful_minutes', 15, 'min');
  ins.run('2020-01-02T12:00:00Z', '2020-01-02', 'time_in_daylight', 38, 'min');
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('sums mindful_minutes per day', () => {
  const rows = queryMindfulnessDaily(db, '2020-01-01');
  const day1 = rows.find(r => r.date === '2020-01-01');
  assert.equal(day1?.mindful_min, 15, 'two sessions of 10+5 = 15 min');
});

test('counts handwashing events (not sum of seconds)', () => {
  const rows = queryMindfulnessDaily(db, '2020-01-01');
  const day1 = rows.find(r => r.date === '2020-01-01');
  assert.equal(day1?.handwashing_count, 3);
});

test('sums daylight minutes per day', () => {
  const rows = queryMindfulnessDaily(db, '2020-01-01');
  const day1 = rows.find(r => r.date === '2020-01-01');
  assert.equal(day1?.daylight_min, 42);
});

test('returns null mindful_min when no sessions', () => {
  // Day 2 has no handwashing
  const rows = queryMindfulnessDaily(db, '2020-01-01');
  const day2 = rows.find(r => r.date === '2020-01-02');
  assert.equal(day2?.handwashing_count, 0);
});

test('returns empty array when no data', () => {
  assert.deepEqual(queryMindfulnessDaily(db, '2099-01-01'), []);
});
