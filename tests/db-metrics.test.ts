import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { upsertMetrics } from '../src/db/metrics.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-metrics-' + Date.now());
let db: Database.Database;

before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const row = {
  ts: '2026-01-15T10:00:00.000Z', date: '2026-01-15',
  metric: 'step_count', qty: 5000, min: null, avg: null, max: null,
  units: 'count', source: 'iPhone', target: 'default', meta: null, session_id: 'sess-1'
};

test('inserts a metric row', () => {
  upsertMetrics(db, [row]);
  const result = db.prepare('SELECT * FROM metrics WHERE metric = ?').get('step_count') as { qty: number };
  assert.equal(result.qty, 5000);
});

test('upserts on conflict — updates qty', () => {
  upsertMetrics(db, [{ ...row, qty: 6000 }]);
  const result = db.prepare('SELECT COUNT(*) as c FROM metrics WHERE metric = ?').get('step_count') as { c: number };
  assert.equal(result.c, 1);
  const updated = db.prepare('SELECT qty FROM metrics WHERE metric = ?').get('step_count') as { qty: number };
  assert.equal(updated.qty, 6000);
});

test('inserts multiple rows in a single call', () => {
  const rows = [
    { ...row, ts: '2026-01-16T10:00:00.000Z', date: '2026-01-16', qty: 7000 },
    { ...row, ts: '2026-01-17T10:00:00.000Z', date: '2026-01-17', qty: 8000 },
  ];
  upsertMetrics(db, rows);
  const result = db.prepare('SELECT COUNT(*) as c FROM metrics WHERE metric = ?').get('step_count') as { c: number };
  assert.equal(result.c, 3);
});
