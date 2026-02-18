# ZIP + Env Config + Watch + Dedup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ZIP import support, full env/Docker config, `hvault watch` polling command, and SHA-256 deduplication to the existing hae-vault codebase.

**Architecture:** New `src/config.ts` singleton loads dotenv then exports all config values; CLI commands read defaults from `config` and let flags override. Import dedup lives in `src/db/importLog.ts` (testable pure DB functions). ZIP extraction lives in `src/util/zip.ts` (shared by `import` and `watch`). `ingest()` gets a return type so counts can flow into `import_log`.

**Tech Stack:** adm-zip (sync ZIP extraction), dotenv (env file loading), node:crypto (SHA-256), node:test + node:assert (existing test runner)

**Start state:** 44 tests passing, `npm test` is green. Keep it green after every task.

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install adm-zip and dotenv**

```bash
npm install adm-zip dotenv --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: both appear in `dependencies` in package.json. `adm-zip` and `dotenv` both ship their own TypeScript types — no `@types/*` packages needed.

**Step 2: Verify tests still pass**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `pass 44`, `fail 0`

**Step 3: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add package.json package-lock.json && git commit -m "chore: add adm-zip and dotenv dependencies"
```

---

## Task 2: Add `import_log` table to schema

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `tests/db-schema.test.ts`

**Step 1: Write the failing test**

Add to the bottom of `tests/db-schema.test.ts`:

```typescript
test('creates import_log table', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_log'").get();
  assert.ok(row);
});
```

**Step 2: Run to verify it fails**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault 2>&1 | grep -A3 "import_log"
```

Expected: `fail 1` — `import_log` table doesn't exist yet.

**Step 3: Add the table to schema.ts**

In `src/db/schema.ts`, inside the `db.exec(...)` template string, after the `sync_log` CREATE block, add:

```typescript
    CREATE TABLE IF NOT EXISTS import_log (
      id             INTEGER PRIMARY KEY,
      filename       TEXT NOT NULL,
      file_hash      TEXT NOT NULL UNIQUE,
      imported_at    TEXT NOT NULL,
      metrics_added  INTEGER,
      sleep_added    INTEGER,
      workouts_added INTEGER
    );
```

**Step 4: Run tests to verify passing**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `pass 45`, `fail 0`

**Step 5: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/db/schema.ts tests/db-schema.test.ts && git commit -m "feat: add import_log table for file deduplication"
```

---

## Task 3: Change `ingest()` to return `IngestResult`

**Files:**
- Modify: `src/server/ingest.ts`
- Modify: `tests/ingest.test.ts`

**Step 1: Write the failing test**

Add to the bottom of `tests/ingest.test.ts`:

```typescript
test('ingest returns IngestResult with counts', () => {
  const freshPayload: HaePayload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ date: '2026-02-01 10:00:00 +0000', qty: 1000 }] },
        {
          name: 'sleep_analysis', units: 'hr',
          data: [{
            sleepStart: '2026-02-01 22:00:00 +0000',
            sleepEnd: '2026-02-02 06:00:00 +0000',
            core: 2.0, deep: 1.0, rem: 1.0, awake: 0.2, asleep: 4.0, inBed: 4.5,
            source: 'Apple Watch'
          }]
        }
      ],
      workouts: [
        { name: 'Cycling', start: '2026-02-01 07:00:00 +0000', end: '2026-02-01 08:00:00 +0000' }
      ]
    }
  };
  const result = ingest(db, freshPayload, { target: 'test', sessionId: 'sess-count', automationName: 'test', automationPeriod: 'manual' });
  assert.ok(typeof result.metricsAdded === 'number');
  assert.ok(typeof result.sleepAdded === 'number');
  assert.ok(typeof result.workoutsAdded === 'number');
  assert.equal(result.metricsAdded, 1);   // step_count only (sleep goes to sleep table)
  assert.equal(result.sleepAdded, 1);
  assert.equal(result.workoutsAdded, 1);
});
```

**Step 2: Run to verify it fails**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault 2>&1 | grep -E "(fail|IngestResult)"
```

Expected: `fail 1` — TypeScript error or test failure on result type.

**Step 3: Update `src/server/ingest.ts`**

Replace the entire file with:

```typescript
import type Database from 'better-sqlite3';
import type { HaePayload, SleepDatapoint } from '../types/hae.js';
import { parseMetric } from '../parse/metrics.js';
import { normalizeSleep } from '../parse/sleep.js';
import { parseWorkout } from '../parse/workouts.js';
import { upsertMetrics } from '../db/metrics.js';
import { upsertSleep } from '../db/sleep.js';
import { upsertWorkout } from '../db/workouts.js';

export interface IngestOptions {
  target: string;
  sessionId: string | null;
  automationName?: string;
  automationPeriod?: string;
}

export interface IngestResult {
  metricsAdded: number;
  sleepAdded: number;
  workoutsAdded: number;
}

export function ingest(db: Database.Database, payload: HaePayload, opts: IngestOptions): IngestResult {
  const { target, sessionId } = opts;
  const { data } = payload;

  let metricsAdded = 0;
  let sleepAdded = 0;
  let workoutsAdded = 0;

  // Process metrics
  for (const m of data.metrics ?? []) {
    if (m.name === 'sleep_analysis') {
      for (const dp of (m.data as SleepDatapoint[])) {
        const row = normalizeSleep(dp, target, sessionId);
        upsertSleep(db, row);
        sleepAdded++;
      }
    } else {
      const rows = parseMetric(m, target, sessionId);
      upsertMetrics(db, rows);
      metricsAdded += rows.length;
    }
  }

  // Process workouts
  for (const w of data.workouts ?? []) {
    const row = parseWorkout(w, target, sessionId);
    upsertWorkout(db, row);
    workoutsAdded++;
  }

  // Log sync
  db.prepare(`
    INSERT INTO sync_log (received_at, target, session_id, metrics_count, workouts_count, automation_name, automation_period)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    target,
    sessionId,
    metricsAdded,
    workoutsAdded,
    opts.automationName ?? null,
    opts.automationPeriod ?? null,
  );

  return { metricsAdded, sleepAdded, workoutsAdded };
}
```

**Step 4: Run tests**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `pass 46`, `fail 0`

**Step 5: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/server/ingest.ts tests/ingest.test.ts && git commit -m "feat: ingest() returns IngestResult with row counts"
```

---

## Task 4: Create `src/db/importLog.ts` + tests

**Files:**
- Create: `src/db/importLog.ts`
- Create: `tests/db-import-log.test.ts`

**Step 1: Write the failing tests**

Create `tests/db-import-log.test.ts`:

```typescript
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
```

**Step 2: Run to verify it fails**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault 2>&1 | grep -E "(fail|importLog)"
```

Expected: `fail 4` — module not found.

**Step 3: Create `src/db/importLog.ts`**

```typescript
import type Database from 'better-sqlite3';
import type { IngestResult } from '../server/ingest.js';

export function hasBeenImported(db: Database.Database, hash: string): boolean {
  return db.prepare('SELECT id FROM import_log WHERE file_hash = ?').get(hash) !== undefined;
}

export function logImport(
  db: Database.Database,
  filename: string,
  hash: string,
  result: IngestResult,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO import_log (filename, file_hash, imported_at, metrics_added, sleep_added, workouts_added)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(filename, hash, new Date().toISOString(), result.metricsAdded, result.sleepAdded, result.workoutsAdded);
}
```

**Step 4: Run tests**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `pass 50`, `fail 0`

**Step 5: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/db/importLog.ts tests/db-import-log.test.ts && git commit -m "feat: add importLog DB helpers with dedup check"
```

---

## Task 5: Create `src/util/zip.ts` + tests

**Files:**
- Create: `src/util/zip.ts`
- Create: `tests/util-zip.test.ts`

**Step 1: Write the failing tests**

Create `tests/util-zip.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { extractPayloadFromZip } from '../src/util/zip.js';

function makeZip(filename: string, content: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(filename, Buffer.from(content, 'utf-8'));
  return zip.toBuffer();
}

const validPayload = JSON.stringify({ data: { metrics: [], workouts: [] } });

test('extracts payload from zip containing HealthAutoExport-*.json', () => {
  const buf = makeZip('HealthAutoExport-test-2026-01-15.json', validPayload);
  const result = extractPayloadFromZip(buf);
  assert.ok(result);
  assert.deepEqual(result!.data.metrics, []);
});

test('returns null when zip has no HealthAutoExport-*.json', () => {
  const buf = makeZip('workout.gpx', '<gpx/>');
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('returns null when matching entry contains invalid JSON', () => {
  const buf = makeZip('HealthAutoExport-bad.json', 'not json {{{');
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('returns null when JSON lacks data field', () => {
  const buf = makeZip('HealthAutoExport-nodatafield.json', JSON.stringify({ other: true }));
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('ignores .gpx entries and finds the .json', () => {
  const zip = new AdmZip();
  zip.addFile('route.gpx', Buffer.from('<gpx/>', 'utf-8'));
  zip.addFile('HealthAutoExport-2026.json', Buffer.from(validPayload, 'utf-8'));
  const buf = zip.toBuffer();
  const result = extractPayloadFromZip(buf);
  assert.ok(result);
});
```

**Step 2: Run to verify it fails**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault 2>&1 | grep -E "(fail|zip)"
```

Expected: `fail 5` — module not found.

**Step 3: Create `src/util/zip.ts`**

```typescript
import AdmZip from 'adm-zip';
import type { HaePayload } from '../types/hae.js';

const HAE_JSON_PATTERN = /HealthAutoExport.*\.json$/i;

export function extractPayloadFromZip(buf: Buffer): HaePayload | null {
  try {
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find(e => HAE_JSON_PATTERN.test(e.entryName));
    if (!entry) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(entry.getData().toString('utf-8'));
    } catch {
      return null;
    }

    if (!payload || typeof payload !== 'object' || !('data' in payload)) return null;
    return payload as HaePayload;
  } catch {
    return null;
  }
}
```

**Step 4: Run tests**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `pass 55`, `fail 0`

**Step 5: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/util/zip.ts tests/util-zip.test.ts && git commit -m "feat: add ZIP extraction utility for HAE exports"
```

---

## Task 6: Create `src/config.ts`

No tests for config itself (it reads `process.env` at import time — tested implicitly via integration). Implementation only.

**Files:**
- Create: `src/config.ts`
- Modify: `src/index.ts`

**Step 1: Create `src/config.ts`**

```typescript
import { config as dotenvLoad } from 'dotenv';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return homedir() + p.slice(1);
  }
  return p;
}

// Load .env: HVAULT_ENV_FILE env var overrides; fallback to CWD .env
const envFile = process.env.HVAULT_ENV_FILE ?? join(process.cwd(), '.env');
if (existsSync(envFile)) {
  dotenvLoad({ path: envFile });
}

const DEFAULT_DB_PATH = join(homedir(), '.hae-vault', 'health.db');

export const config = {
  dbPath:        expandTilde(process.env.HVAULT_DB_PATH ?? DEFAULT_DB_PATH),
  port:          Number(process.env.HVAULT_PORT ?? 4242),
  token:         process.env.HVAULT_TOKEN,
  watchDir:      process.env.HVAULT_WATCH_DIR ? expandTilde(process.env.HVAULT_WATCH_DIR) : undefined,
  watchInterval: Number(process.env.HVAULT_WATCH_INTERVAL ?? 60),
  target:        process.env.HVAULT_TARGET ?? 'default',
} as const;
```

**Step 2: Import config first in `src/index.ts`**

Replace the current `src/index.ts` with:

```typescript
#!/usr/bin/env node
import './config.js';  // load dotenv before any command runs
import { program } from './cli/index.js';
program.parse();
```

**Step 3: Build to verify no TypeScript errors**

```bash
npm run build --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: exits 0, no errors.

**Step 4: Run tests**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: same pass count, `fail 0`

**Step 5: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/config.ts src/index.ts && git commit -m "feat: add config singleton with dotenv + env var support"
```

---

## Task 7: Wire config into `serve.ts` and update `import.ts`

**Files:**
- Modify: `src/cli/serve.ts`
- Modify: `src/cli/import.ts`

**Step 1: Update `src/cli/serve.ts`**

Replace the entire file:

```typescript
import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';
import { config } from '../config.js';

export const serveCommand = new Command('serve')
  .description('Start HTTP server to receive Health Auto Export pushes')
  .option('-p, --port <number>', 'Port to listen on', String(config.port))
  .option('--token <secret>', 'Require Authorization: Bearer <secret>', config.token)
  .action((opts) => {
    const db = openDb(config.dbPath);
    const app = createApp(db, { token: opts.token });
    const port = parseInt(opts.port, 10);
    app.listen(port, () => {
      console.log(`hvault server listening on http://0.0.0.0:${port}/api/ingest`);
      if (opts.token) console.log('Auth: Bearer token required');
    });
  });
```

**Step 2: Replace `src/cli/import.ts`**

Replace the entire file:

```typescript
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
```

**Step 3: Build and test**

```bash
npm run build --prefix /Volumes/storage/01_Projects/whoop/hae-vault && npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: build succeeds, all tests pass, `fail 0`

**Step 4: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/cli/serve.ts src/cli/import.ts && git commit -m "feat: wire config into serve/import, add ZIP + dedup to import"
```

---

## Task 8: Create `hvault watch` command

**Files:**
- Create: `src/cli/watch.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/cli-watch.test.ts`

**Step 1: Write the failing test**

Create `tests/cli-watch.test.ts`:

```typescript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { tick } from '../src/cli/watch.js';
import { hasBeenImported } from '../src/db/importLog.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-watch-' + Date.now());
const watchDir = join(testDir, 'watch');
let db: Database.Database;

const haeJson = JSON.stringify({
  data: {
    metrics: [{ name: 'step_count', units: 'count', data: [{ date: '2026-01-10 10:00:00 +0000', qty: 5000 }] }],
    workouts: []
  }
});

before(() => {
  mkdirSync(testDir, { recursive: true });
  mkdirSync(watchDir, { recursive: true });
  db = openDb(join(testDir, 'test.db'));
});

after(() => {
  closeDb(db);
  rmSync(testDir, { recursive: true });
});

test('tick imports a new HealthAutoExport-*.json file', () => {
  writeFileSync(join(watchDir, 'HealthAutoExport-test.json'), haeJson);
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);
});

test('tick skips already-imported file (dedup)', () => {
  // Same file still in dir — hash already in import_log
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1);
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
});

test('tick ignores non-HAE files', () => {
  writeFileSync(join(watchDir, 'random.txt'), 'not a health export');
  writeFileSync(join(watchDir, 'workout.gpx'), '<gpx/>');
  const result = tick(db, watchDir, 'default');
  assert.equal(result.found, 1); // only the HAE json counts as "found"
  assert.equal(result.imported, 0);
});

test('tick records import in import_log', () => {
  writeFileSync(join(watchDir, 'HealthAutoExport-new.json'), JSON.stringify({
    data: { metrics: [{ name: 'step_count', units: 'count', data: [{ date: '2026-01-11 10:00:00 +0000', qty: 6000 }] }], workouts: [] }
  }));
  tick(db, watchDir, 'default');
  const newFilePath = join(watchDir, 'HealthAutoExport-new.json');
  // After tick, the file should be marked as imported (dedup check via a second tick)
  const result2 = tick(db, watchDir, 'default');
  assert.equal(result2.imported, 0); // all skipped on second pass
});
```

**Step 2: Run to verify it fails**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault 2>&1 | grep -E "(fail|watch)"
```

Expected: `fail 4` — module not found.

**Step 3: Create `src/cli/watch.ts`**

```typescript
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
```

**Step 4: Register watch in `src/cli/index.ts`**

Add import and addCommand. The file currently ends with `program.addCommand(statsCommand);`. Add after it:

```typescript
import { watchCommand } from './watch.js';
// ...
program.addCommand(watchCommand);
```

Full updated `src/cli/index.ts`:

```typescript
import { Command } from 'commander';
import { serveCommand } from './serve.js';
import { metricsCommand } from './metrics.js';
import { sleepCommand } from './sleep.js';
import { workoutsCommand } from './workouts.js';
import { summaryCommand } from './summary.js';
import { queryCommand } from './query.js';
import { sourcesCommand, lastSyncCommand, statsCommand } from './info.js';
import { importCommand } from './import.js';
import { watchCommand } from './watch.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.1.0');

program.addCommand(serveCommand);
program.addCommand(importCommand);
program.addCommand(watchCommand);
program.addCommand(metricsCommand);
program.addCommand(sleepCommand);
program.addCommand(workoutsCommand);
program.addCommand(summaryCommand);
program.addCommand(queryCommand);
program.addCommand(sourcesCommand);
program.addCommand(lastSyncCommand);
program.addCommand(statsCommand);
```

**Step 5: Build and run all tests**

```bash
npm run build --prefix /Volumes/storage/01_Projects/whoop/hae-vault && npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: build succeeds, `fail 0`. Pass count should be 55+ (all prior + 4 watch tests).

**Step 6: Commit**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git add src/cli/watch.ts src/cli/index.ts tests/cli-watch.test.ts && git commit -m "feat: add hvault watch command with polling and dedup"
```

---

## Task 9: Final verification

**Step 1: Full clean build**

```bash
npm run build --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: exits 0, no TypeScript errors.

**Step 2: Full test suite**

```bash
npm test --prefix /Volumes/storage/01_Projects/whoop/hae-vault
```

Expected: `fail 0`. All tests pass.

**Step 3: Smoke test the CLI**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && node dist/index.js --help
node dist/index.js import --help
node dist/index.js watch --help
node dist/index.js serve --help
```

Verify: `import` help mentions ZIP, `watch` appears in command list, `serve` shows default port.

**Step 4: Final commit if any cleanup needed, then tag**

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git log --oneline -10
```

Confirm all feature commits are present.
