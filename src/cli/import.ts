import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { openDb } from '../db/schema.js';
import { ingest } from '../server/ingest.js';
import type { HaePayload } from '../types/hae.js';

export const importCommand = new Command('import')
  .description('Import a Health Auto Export JSON file into the database')
  .argument('<file>', 'Path to the HAE JSON export file')
  .option('--target <name>', 'Target name (device/person identifier)', 'default')
  .option('--pretty', 'Pretty-print summary JSON', false)
  .action((file: string, opts) => {
    let raw: string;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch (err) {
      console.error(JSON.stringify({ error: `Cannot read file: ${String(err)}` }));
      process.exit(1);
    }

    let payload: HaePayload;
    try {
      payload = JSON.parse(raw) as HaePayload;
    } catch (err) {
      console.error(JSON.stringify({ error: `Invalid JSON: ${String(err)}` }));
      process.exit(1);
    }

    if (!payload?.data) {
      console.error(JSON.stringify({ error: 'Missing data field — not a valid HAE export' }));
      process.exit(1);
    }

    const db = openDb();
    try {
      ingest(db, payload, {
        target: opts.target,
        sessionId: null,
        automationName: 'file-import',
        automationPeriod: 'manual',
      });
    } catch (err) {
      console.error(JSON.stringify({ error: `Ingest failed: ${String(err)}` }));
      process.exit(1);
    }

    const metrics = (db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number }).c;
    const sleep = (db.prepare('SELECT COUNT(*) as c FROM sleep').get() as { c: number }).c;
    const workouts = (db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number }).c;
    const result = { ok: true, file, target: opts.target, db: { metrics, sleep, workouts } };
    console.log(opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  });
