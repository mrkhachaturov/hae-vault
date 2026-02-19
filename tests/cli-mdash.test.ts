import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { renderMdash } from '../src/cli/mdash.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-mdash-' + Date.now());
let db: Database.Database;

before(() => {
  mkdirSync(testDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
  const ins = db.prepare(
    `INSERT INTO metrics (ts, date, metric, qty, units, source, target) VALUES (?, ?, ?, ?, ?, 'Watch', 'me')`
  );
  for (let i = 1; i <= 5; i++) {
    const d = `2020-01-0${i}`;
    ins.run(`2020-01-0${i}T10:00:00Z`, d, 'walking_speed', 4.8 + i * 0.1, 'km/hr');
    ins.run(`2020-01-0${i}T10:00:00Z`, d, 'walking_step_length', 72 + i * 0.3, 'cm');
    ins.run(`2020-01-0${i}T10:00:00Z`, d, 'walking_asymmetry_percentage', 4.0 - i * 0.1, '%');
    ins.run(`2020-01-0${i}T10:00:00Z`, d, 'stair_speed_up', 0.55 + i * 0.02, 'm/s');
  }
});

after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

test('renderMdash contains Mobility Dashboard header', () => {
  const out = renderMdash(db, 30, '2020-01-05');
  assert.ok(out.includes('Mobility Dashboard'));
});

test('renderMdash shows walking speed', () => {
  const out = renderMdash(db, 30, '2020-01-05');
  assert.ok(out.includes('km/h') || out.includes('Speed'));
});

test('renderMdash shows trends with arrows', () => {
  const out = renderMdash(db, 30, '2020-01-05');
  assert.ok(out.match(/[↑↓→]/));
});

test('renderMdash handles empty DB', () => {
  const emptyDir = join(tmpdir(), 'hae-vault-empty-mdash-' + Date.now());
  mkdirSync(emptyDir, { recursive: true });
  const emptyDb = openDb(join(emptyDir, 'test.db'));
  const out = renderMdash(emptyDb, 14, '2020-01-01');
  assert.ok(out.includes('No mobility'));
  closeDb(emptyDb);
  rmSync(emptyDir, { recursive: true });
});
