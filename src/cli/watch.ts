import { Command } from 'commander';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openDb } from '../db/schema.js';
import { ingest } from '../server/ingest.js';
import { hasBeenImported, logImport } from '../db/importLog.js';
import { extractPayloadFromZip } from '../util/zip.js';
import { config } from '../config.js';
import type { HaePayload } from '../types/hae.js';

const HAE_PATTERN = /^HealthAutoExport.*\.(zip|json)$/i;

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function loadBuf(buf: Buffer, filename: string): HaePayload | null {
  if (filename.toLowerCase().endsWith('.zip')) {
    return extractPayloadFromZip(buf);
  }
  try {
    const p = JSON.parse(buf.toString('utf-8')) as HaePayload;
    return p?.data ? p : null;
  } catch {
    return null;
  }
}

export interface TickResult {
  tick: string;
  dir: string;
  found: number;
  imported: number;
  skipped: number;
}

export function tick(db: Database.Database, watchDir: string, target: string): TickResult {
  const now = new Date().toISOString();
  let found = 0, imported = 0, skipped = 0;

  let files: string[];
  try {
    files = readdirSync(watchDir).filter(f => HAE_PATTERN.test(f));
  } catch (err) {
    console.error(JSON.stringify({ error: `Cannot read watch dir: ${String(err)}` }));
    return { tick: now, dir: watchDir, found, imported, skipped };
  }

  found = files.length;

  for (const filename of files) {
    const filepath = join(watchDir, filename);
    let buf: Buffer;
    try {
      buf = readFileSync(filepath);
    } catch {
      skipped++;
      continue;
    }

    const hash = sha256(buf);
    if (hasBeenImported(db, hash)) {
      skipped++;
      continue;
    }

    const payload = loadBuf(buf, filename);
    if (!payload) {
      skipped++;
      continue;
    }

    const result = ingest(db, payload, {
      target,
      sessionId: null,
      automationName: 'watch',
      automationPeriod: 'manual',
    });

    logImport(db, filepath, hash, result);
    console.log(JSON.stringify({ imported: filename, target, ...result }));
    imported++;
  }

  const summary: TickResult = { tick: now, dir: watchDir, found, imported, skipped };
  console.log(JSON.stringify(summary));
  return summary;
}

export const watchCommand = new Command('watch')
  .description('Poll a directory for new HAE exports and auto-import them')
  .option('--dir <path>', 'Directory to watch', config.watchDir)
  .option('--interval <seconds>', 'Poll interval in seconds', String(config.watchInterval))
  .option('--target <name>', 'Target name', config.target)
  .action((opts) => {
    const watchDir: string | undefined = opts.dir;
    if (!watchDir) {
      console.error(JSON.stringify({ error: 'Watch directory required: use --dir or set HVAULT_WATCH_DIR' }));
      process.exit(1);
    }

    const intervalMs = Number(opts.interval) * 1000;
    const db = openDb(config.dbPath);

    console.log(JSON.stringify({ watching: watchDir, intervalSeconds: Number(opts.interval), target: opts.target }));

    tick(db, watchDir, opts.target);
    setInterval(() => tick(db, watchDir, opts.target), intervalMs);
  });
