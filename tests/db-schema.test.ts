import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-schema-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
});

after(() => {
  closeDb(db);
  rmSync(testDir, { recursive: true });
});

test('creates metrics table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metrics'").get();
  assert.ok(row);
});

test('creates sleep table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sleep'").get();
  assert.ok(row);
});

test('creates workouts table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workouts'").get();
  assert.ok(row);
});

test('creates sync_log table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_log'").get();
  assert.ok(row);
});

test('WAL mode is enabled', () => {
  const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
  assert.equal(row.journal_mode, 'wal');
});

test('openDb is idempotent — calling twice does not throw', () => {
  const db2 = openDb(join(testDir, 'test.db'));
  closeDb(db2);
});

test('creates import_log table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_log'").get();
  assert.ok(row);
});
