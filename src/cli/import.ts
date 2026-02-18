import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDb } from '../db/schema.js';
import { ingest } from '../server/ingest.js';
import { hasBeenImported, logImport } from '../db/importLog.js';
import { extractPayloadFromZip } from '../util/zip.js';
import { config } from '../config.js';
import type { HaePayload } from '../types/hae.js';

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function loadFile(file: string): { payload: HaePayload; hash: string } {
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch (err) {
    console.error(JSON.stringify({ error: `Cannot read file: ${String(err)}` }));
    process.exit(1);
  }

  const hash = sha256(buf);

  let payload: HaePayload | null;
  if (file.toLowerCase().endsWith('.zip')) {
    payload = extractPayloadFromZip(buf);
    if (!payload) {
      console.error(JSON.stringify({ error: 'No valid HealthAutoExport-*.json found in zip' }));
      process.exit(1);
    }
  } else {
    try {
      payload = JSON.parse(buf.toString('utf-8')) as HaePayload;
    } catch (err) {
      console.error(JSON.stringify({ error: `Invalid JSON: ${String(err)}` }));
      process.exit(1);
    }
    if (!payload?.data) {
      console.error(JSON.stringify({ error: 'Missing data field — not a valid HAE export' }));
      process.exit(1);
    }
  }

  return { payload, hash };
}

export const importCommand = new Command('import')
  .description('Import a Health Auto Export JSON or ZIP file into the database')
  .argument('<file>', 'Path to the HAE JSON or ZIP export file')
  .option('--target <name>', 'Target name (device/person identifier)', config.target)
  .option('--pretty', 'Pretty-print summary JSON', false)
  .action((file: string, opts) => {
    const db = openDb(config.dbPath);
    const { payload, hash } = loadFile(file);

    if (hasBeenImported(db, hash)) {
      const result = { skipped: true, reason: 'already imported', file, hash };
      console.log(opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
      return;
    }

    const ingestResult = ingest(db, payload, {
      target: opts.target,
      sessionId: null,
      automationName: 'file-import',
      automationPeriod: 'manual',
    });

    logImport(db, file, hash, ingestResult);

    const result = {
      ok: true,
      file,
      target: opts.target,
      hash,
      added: {
        metrics: ingestResult.metricsAdded,
        sleep: ingestResult.sleepAdded,
        workouts: ingestResult.workoutsAdded,
      },
    };
    console.log(opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  });
