import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { hasBeenImported, logImport } from '../src/db/importLog.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-importlog-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('hasBeenImported returns false for unknown hash', () => {
  assert.equal(hasBeenImported(db, 'deadbeef1234'), false);
});

test('logImport records the import', () => {
  logImport(db, 'export.zip', 'abc123hash', { metricsAdded: 100, sleepAdded: 7, workoutsAdded: 3 });
  const row = db.prepare('SELECT * FROM import_log WHERE file_hash = ?').get('abc123hash') as {
    filename: string; metrics_added: number; sleep_added: number; workouts_added: number;
  } | undefined;
  assert.ok(row);
  assert.equal(row!.filename, 'export.zip');
  assert.equal(row!.metrics_added, 100);
  assert.equal(row!.sleep_added, 7);
  assert.equal(row!.workouts_added, 3);
});

test('hasBeenImported returns true after logImport', () => {
  assert.equal(hasBeenImported(db, 'abc123hash'), true);
});

test('logImport with duplicate hash is a no-op (INSERT OR IGNORE)', () => {
  // Should not throw
  logImport(db, 'export-copy.zip', 'abc123hash', { metricsAdded: 999, sleepAdded: 999, workoutsAdded: 999 });
  const count = db.prepare('SELECT COUNT(*) as c FROM import_log WHERE file_hash = ?').get('abc123hash') as { c: number };
  assert.equal(count.c, 1); // still only one row
});
