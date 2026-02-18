import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { upsertSleep } from '../src/db/sleep.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-sleep-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const row = {
  date: '2026-01-15',
  sleep_start: '2026-01-14T22:00:00.000Z', sleep_end: '2026-01-15T06:00:00.000Z',
  in_bed_start: null, in_bed_end: null,
  core_h: 3.0, deep_h: 1.0, rem_h: 1.5, awake_h: 0.5, asleep_h: 5.5, in_bed_h: 6.0,
  schema_ver: 'aggregated_v2' as const,
  source: 'Apple Watch', target: 'default', meta: null, session_id: 'sess-1'
};

test('inserts sleep row', () => {
  upsertSleep(db, row);
  const result = db.prepare('SELECT core_h FROM sleep WHERE date = ?').get('2026-01-15') as { core_h: number };
  assert.equal(result.core_h, 3.0);
});

test('upserts sleep — overwrites on same date+source+target', () => {
  upsertSleep(db, { ...row, core_h: 3.5 });
  const count = db.prepare('SELECT COUNT(*) as c FROM sleep').get() as { c: number };
  assert.equal(count.c, 1);
  const updated = db.prepare('SELECT core_h FROM sleep WHERE date = ?').get('2026-01-15') as { core_h: number };
  assert.equal(updated.core_h, 3.5);
});
