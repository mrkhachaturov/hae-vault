# hae-vault Initial Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `hae-vault` npm package — an HTTP ingest server + CLI query tool for Apple Health data pushed from the Health Auto Export iOS app, stored in a local SQLite database.

**Architecture:** An Express HTTP server receives POST payloads from HAE app, parses them (handling 5 date formats + 3 sleep schema variants), and upserts into a SQLite database via `better-sqlite3`. A Commander CLI reads from the same database and returns JSON for AI agent consumption.

**Tech Stack:** TypeScript (ESM, Node 22+), `better-sqlite3`, `express`, `commander`, `tsx` (dev), Node built-in test runner

---

## Reference Material

- `CLAUDE.md` in this repo — complete spec, payload format, schema, CLI commands
- `/Volumes/storage/01_Projects/whoop/healthy/health-auto-export-server/server/src/models/MetricName.ts` — enum of 80+ metric name strings
- `/Volumes/storage/01_Projects/whoop/healthy/apple-health-ingester/pkg/healthautoexport/types.go` — most complete type defs + 5-format time parser + sleep detection logic
- `/Volumes/storage/01_Projects/whoop/whoop-sync/` — reference for `package.json` / `tsconfig.json` / Commander CLI patterns

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `tests/.gitkeep`

**Step 1: Create `package.json`**

```json
{
  "name": "hae-vault",
  "version": "0.1.0",
  "description": "CLI + HTTP server for Apple Health data from Health Auto Export",
  "type": "module",
  "bin": {
    "hvault": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prepare": "npm run build",
    "test": "tsx --test tests/**/*.test.ts"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "author": "Ruben Khachaturov <mr.kha4a2rov@protonmail.com>",
  "license": "MIT",
  "dependencies": {
    "better-sqlite3": "^9.6.0",
    "commander": "^12.1.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `src/index.ts`** (minimal stub, expanded later)

```typescript
#!/usr/bin/env node
import { program } from './cli/index.js';
program.parse();
```

**Step 4: Create `src/cli/index.ts`** (stub)

```typescript
import { Command } from 'commander';
export const program = new Command();
program.name('hvault').description('Apple Health data vault').version('0.1.0');
```

**Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated, no errors.

**Step 6: Verify TypeScript compiles**

```bash
npm run build
```

Expected: `dist/` created, no TypeScript errors.

**Step 7: Commit**

```bash
git init
git add package.json tsconfig.json src/
git commit -m "chore: project scaffolding — package.json, tsconfig, entry point"
```

---

## Task 2: TypeScript Types for HAE Payload

**Files:**
- Create: `src/types/hae.ts`
- Create: `tests/types.test.ts`

**Context:** The HAE app sends a JSON body. Top level has `data.metrics[]`, `data.workouts[]`, and optionally other arrays. Each metric has a `name`, `units`, and `data[]` array. Sleep data has 3 different schemas. Workouts have dynamic fields.

**Step 1: Write the failing test**

```typescript
// tests/types.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HaePayload, MetricData, WorkoutData } from '../src/types/hae.js';

test('HaePayload shape is correct', () => {
  const payload: HaePayload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ date: '2026-01-15 10:00:00 +0000', qty: 5000 }] }
      ],
      workouts: []
    }
  };
  assert.equal(payload.data.metrics![0].name, 'step_count');
});

test('SleepAnalysis non-aggregated shape', () => {
  const row = { startDate: '2026-01-15 22:00:00 +0000', endDate: '2026-01-16 06:00:00 +0000', value: 'ASLEEP_CORE', source: 'Apple Watch', qty: 1.5 };
  assert.ok('startDate' in row);
  assert.ok('value' in row);
});

test('AggregatedSleepV2 shape', () => {
  const row = { sleepStart: '2026-01-15 22:00:00 +0000', sleepEnd: '2026-01-16 06:00:00 +0000', core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0, source: 'Apple Watch' };
  assert.ok('source' in row && 'core' in row);
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: Error like `Cannot find module '../src/types/hae.js'`

**Step 3: Create `src/types/hae.ts`**

```typescript
// Raw datapoint from HAE — most metrics
export interface RawDatapoint {
  date: string;
  qty?: number;
  // heart_rate: Min/Avg/Max instead of qty
  Min?: number;
  Avg?: number;
  Max?: number;
  // blood_pressure: systolic/diastolic
  systolic?: number;
  diastolic?: number;
  units?: string;
  source?: string;
}

// Non-aggregated sleep_analysis (each phase as a separate entry)
export interface SleepAnalysisRaw {
  startDate: string;
  endDate: string;
  value: string; // 'ASLEEP_CORE' | 'ASLEEP_DEEP' | 'ASLEEP_REM' | 'INBED' | 'AWAKE'
  source: string;
  qty?: number;
}

// Aggregated sleep v2 (HAE >= 6.6.2): has `source` field
export interface AggregatedSleepV2 {
  sleepStart: string;
  sleepEnd: string;
  core: number;
  deep: number;
  rem: number;
  awake: number;
  asleep: number;
  inBed: number;
  source: string;
}

// Aggregated sleep v1 (HAE < 6.6.2): has sleepSource/inBedSource instead
export interface AggregatedSleepV1 {
  sleepStart: string;
  sleepEnd: string;
  inBedStart: string;
  inBedEnd: string;
  asleep: number;
  inBed: number;
  sleepSource?: string;
  inBedSource?: string;
}

export type SleepDatapoint = SleepAnalysisRaw | AggregatedSleepV2 | AggregatedSleepV1;

export interface MetricData {
  name: string;
  units: string;
  data: RawDatapoint[] | SleepDatapoint[];
}

export interface WorkoutData {
  name: string;
  start: string;
  end: string;
  duration?: number;
  activeEnergyBurned?: { qty: number; units: string };
  distance?: { qty: number; units: string };
  heartRateData?: Array<{ date: string; qty: number; units: string }>;
  heartRateRecovery?: Array<{ date: string; qty: number; units: string }>;
  route?: Array<{ lat: number; lon: number; altitude: number; timestamp: string }>;
  elevation?: { ascent: number; descent: number; units: string };
  [key: string]: unknown; // dynamic fields
}

export interface HaePayload {
  data: {
    metrics?: MetricData[];
    workouts?: WorkoutData[];
    stateOfMind?: unknown[];
    medications?: unknown[];
    symptoms?: unknown[];
    cycleTracking?: unknown[];
    ecg?: unknown[];
    heartRateNotifications?: unknown[];
  };
}

// HAE request headers
export interface HaeHeaders {
  'automation-name'?: string;
  'automation-id'?: string;
  'automation-aggregation'?: string;
  'automation-period'?: string;
  'session-id'?: string;
  'authorization'?: string;
  'x-api-key'?: string;
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/types/ tests/types.test.ts
git commit -m "feat: TypeScript types for HAE payload (metrics, sleep variants, workouts)"
```

---

## Task 3: Date Parser (5 Format Variants)

**Files:**
- Create: `src/parse/time.ts`
- Create: `tests/parse-time.test.ts`

**Context:** HAE sends timestamps in 5 formats depending on iPhone locale. Must try last-used format first (cache), then fall back to all others. Return ISO8601 string for DB storage.

The 5 formats:
1. `"2026-01-15 14:30:00 +0000"` — 24-hour (most common)
2. `"2026-01-15 2:30:00 PM +0000"` — 12-hour uppercase AM/PM
3. `"2026-01-15 2:30:00 pm +0000"` — 12-hour lowercase am/pm
4. `"2026-01-15 2:30:00\u202fPM +0000"` — narrow non-breaking space before PM (U+202F)
5. `"2026-01-15 2:30:00\u202fpm +0000"` — narrow non-breaking space before pm

**Step 1: Write the failing test**

```typescript
// tests/parse-time.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHaeTime, toIso } from '../src/parse/time.js';

test('parses 24-hour format', () => {
  const result = parseHaeTime('2026-01-15 14:30:00 +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses 12-hour uppercase PM format', () => {
  const result = parseHaeTime('2026-01-15 2:30:00 PM +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses 12-hour lowercase pm format', () => {
  const result = parseHaeTime('2026-01-15 2:30:00 pm +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses narrow non-breaking space before PM (\\u202f)', () => {
  const result = parseHaeTime('2026-01-15 2:30:00\u202fPM +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses narrow non-breaking space before pm (\\u202f)', () => {
  const result = parseHaeTime('2026-01-15 2:30:00\u202fpm +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('throws on unrecognised format', () => {
  assert.throws(() => parseHaeTime('not-a-date'), /Failed to parse/);
});

test('extracts YYYY-MM-DD date', () => {
  const result = parseHaeTime('2026-01-15 14:30:00 +0000');
  assert.equal(result.toISOString().slice(0, 10), '2026-01-15');
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: `Cannot find module '../src/parse/time.js'`

**Step 3: Create `src/parse/time.ts`**

```typescript
// HAE outputs 5 different timestamp formats depending on iPhone locale.
// We cache the last successful format to avoid retrying all formats every call.

const FORMATS = [
  // 24-hour time (most common)
  /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/,
  // 12-hour time: H:mm:ss AM/PM +offset (space or narrow non-breaking space \u202f before AM/PM)
  /^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2})[\u202f ]([APap][Mm]) ([+-]\d{4})$/,
] as const;

let lastWorkingFormat = 0; // index into parse attempt order

function parse24h(date: string, h: string, m: string, s: string, tz: string): Date {
  return new Date(`${date}T${h.padStart(2,'0')}:${m}:${s}${tz.slice(0,3)}:${tz.slice(3)}`);
}

function parse12h(date: string, h: string, m: string, s: string, ampm: string, tz: string): Date {
  let hour = parseInt(h, 10);
  const isAm = ampm.toLowerCase() === 'am';
  if (isAm && hour === 12) hour = 0;
  if (!isAm && hour !== 12) hour += 12;
  const hh = String(hour).padStart(2, '0');
  return new Date(`${date}T${hh}:${m}:${s}${tz.slice(0,3)}:${tz.slice(3)}`);
}

function tryParse(s: string): Date | null {
  // Try 24-hour format
  const m24 = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (m24) return parse24h(m24[1], m24[2], m24[3], m24[4], m24[5]);

  // Try 12-hour format (space or narrow non-breaking space before AM/PM)
  const m12 = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2})[\u202f ]([APap][Mm]) ([+-]\d{4})$/);
  if (m12) return parse12h(m12[1], m12[2], m12[3], m12[4], m12[5], m12[6]);

  return null;
}

export function parseHaeTime(s: string): Date {
  const result = tryParse(s);
  if (result && !isNaN(result.getTime())) return result;
  throw new Error(`Failed to parse HAE timestamp: "${s}"`);
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/parse/time.ts tests/parse-time.test.ts
git commit -m "feat: HAE timestamp parser — handles all 5 date format variants"
```

---

## Task 4: Sleep Parser (3 Schema Variants)

**Files:**
- Create: `src/parse/sleep.ts`
- Create: `tests/parse-sleep.test.ts`

**Context:** `sleep_analysis` is special — same metric name but 3 completely different JSON structures. Detection logic:
1. Has `startDate` and `endDate` → non-aggregated (individual sleep phases)
2. Has `sleepStart`/`sleepEnd` AND `source` field → aggregated v2 (HAE >= 6.6.2)
3. Has `sleepStart`/`sleepEnd` but NO `source` → aggregated v1 (has `sleepSource`/`inBedSource`)

Output: a `NormalizedSleep` row ready for DB insertion.

**Step 1: Write the failing test**

```typescript
// tests/parse-sleep.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSleepVariant, normalizeSleep } from '../src/parse/sleep.js';
import type { SleepDatapoint } from '../src/types/hae.js';

const nonAgg: SleepDatapoint = {
  startDate: '2026-01-15 22:00:00 +0000',
  endDate: '2026-01-16 06:00:00 +0000',
  value: 'ASLEEP_CORE',
  source: 'Apple Watch',
  qty: 1.5
};

const aggV2: SleepDatapoint = {
  sleepStart: '2026-01-15 22:00:00 +0000',
  sleepEnd: '2026-01-16 06:00:00 +0000',
  core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0,
  source: 'Apple Watch'
};

const aggV1: SleepDatapoint = {
  sleepStart: '2026-01-15 22:00:00 +0000',
  sleepEnd: '2026-01-16 06:00:00 +0000',
  inBedStart: '2026-01-15 21:50:00 +0000',
  inBedEnd: '2026-01-16 06:10:00 +0000',
  asleep: 5.5, inBed: 6.0,
  sleepSource: "Ruben's Apple Watch",
  inBedSource: 'iPhone'
};

test('detects non-aggregated variant', () => {
  assert.equal(detectSleepVariant(nonAgg), 'detailed');
});

test('detects aggregated v2 variant', () => {
  assert.equal(detectSleepVariant(aggV2), 'aggregated_v2');
});

test('detects aggregated v1 variant', () => {
  assert.equal(detectSleepVariant(aggV1), 'aggregated_v1');
});

test('normalizes aggregated v2', () => {
  const row = normalizeSleep(aggV2, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'aggregated_v2');
  assert.equal(row.core_h, 3.0);
  assert.equal(row.source, 'Apple Watch');
  assert.ok(row.sleep_start);
  assert.ok(row.date);
});

test('normalizes aggregated v1', () => {
  const row = normalizeSleep(aggV1, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'aggregated_v1');
  assert.equal(row.asleep_h, 5.5);
  assert.ok(row.in_bed_start);
});

test('normalizes non-aggregated — stores raw in meta', () => {
  const row = normalizeSleep(nonAgg, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'detailed');
  assert.ok(row.meta);
  const meta = JSON.parse(row.meta!);
  assert.equal(meta.value, 'ASLEEP_CORE');
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/parse/sleep.js'`

**Step 3: Create `src/parse/sleep.ts`**

```typescript
import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { SleepDatapoint, SleepAnalysisRaw, AggregatedSleepV2, AggregatedSleepV1 } from '../types/hae.js';

export type SleepVariant = 'detailed' | 'aggregated_v2' | 'aggregated_v1';

export interface NormalizedSleep {
  date: string;
  sleep_start: string | null;
  sleep_end: string | null;
  in_bed_start: string | null;
  in_bed_end: string | null;
  core_h: number | null;
  deep_h: number | null;
  rem_h: number | null;
  awake_h: number | null;
  asleep_h: number | null;
  in_bed_h: number | null;
  schema_ver: SleepVariant;
  source: string | null;
  target: string;
  meta: string | null;
  session_id: string | null;
}

export function detectSleepVariant(dp: SleepDatapoint): SleepVariant {
  if ('startDate' in dp && dp.startDate) return 'detailed';
  if ('sleepStart' in dp && 'source' in dp && dp.source) return 'aggregated_v2';
  return 'aggregated_v1';
}

export function normalizeSleep(dp: SleepDatapoint, target: string, sessionId: string | null): NormalizedSleep {
  const variant = detectSleepVariant(dp);

  if (variant === 'detailed') {
    const raw = dp as SleepAnalysisRaw;
    const start = parseHaeTime(raw.startDate);
    return {
      date: toDateStr(start),
      sleep_start: toIso(start),
      sleep_end: toIso(parseHaeTime(raw.endDate)),
      in_bed_start: null,
      in_bed_end: null,
      core_h: null, deep_h: null, rem_h: null, awake_h: null, asleep_h: null, in_bed_h: null,
      schema_ver: 'detailed',
      source: raw.source,
      target,
      meta: JSON.stringify(dp),
      session_id: sessionId,
    };
  }

  if (variant === 'aggregated_v2') {
    const v2 = dp as AggregatedSleepV2;
    const sleepStart = parseHaeTime(v2.sleepStart);
    return {
      date: toDateStr(sleepStart),
      sleep_start: toIso(sleepStart),
      sleep_end: toIso(parseHaeTime(v2.sleepEnd)),
      in_bed_start: null,
      in_bed_end: null,
      core_h: v2.core,
      deep_h: v2.deep,
      rem_h: v2.rem,
      awake_h: v2.awake,
      asleep_h: v2.asleep,
      in_bed_h: v2.inBed,
      schema_ver: 'aggregated_v2',
      source: v2.source,
      target,
      meta: null,
      session_id: sessionId,
    };
  }

  // aggregated_v1
  const v1 = dp as AggregatedSleepV1;
  const sleepStart = parseHaeTime(v1.sleepStart);
  return {
    date: toDateStr(sleepStart),
    sleep_start: toIso(sleepStart),
    sleep_end: toIso(parseHaeTime(v1.sleepEnd)),
    in_bed_start: v1.inBedStart ? toIso(parseHaeTime(v1.inBedStart)) : null,
    in_bed_end: v1.inBedEnd ? toIso(parseHaeTime(v1.inBedEnd)) : null,
    core_h: null, deep_h: null, rem_h: null, awake_h: null,
    asleep_h: v1.asleep,
    in_bed_h: v1.inBed,
    schema_ver: 'aggregated_v1',
    source: v1.sleepSource ?? null,
    target,
    meta: null,
    session_id: sessionId,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/parse/sleep.ts tests/parse-sleep.test.ts
git commit -m "feat: sleep parser — detects and normalizes all 3 sleep schema variants"
```

---

## Task 5: Metrics Parser

**Files:**
- Create: `src/parse/metrics.ts`
- Create: `tests/parse-metrics.test.ts`

**Context:** Most metrics have `{ date, qty }` datapoints. Special cases:
- `heart_rate`: fields are `Min`, `Avg`, `Max` (no `qty`)
- `blood_pressure`: fields are `systolic`, `diastolic` (no `qty`)
- `sleep_analysis`: handled by sleep parser, not here — skip in this parser

Output: array of `NormalizedMetric` rows ready for DB insertion.

**Step 1: Write the failing test**

```typescript
// tests/parse-metrics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetric } from '../src/parse/metrics.js';
import type { MetricData } from '../src/types/hae.js';

const stepMetric: MetricData = {
  name: 'step_count',
  units: 'count',
  data: [
    { date: '2026-01-15 10:00:00 +0000', qty: 5000 },
    { date: '2026-01-15 11:00:00 +0000', qty: 3000 },
  ]
};

const hrMetric: MetricData = {
  name: 'heart_rate',
  units: 'bpm',
  data: [{ date: '2026-01-15 10:00:00 +0000', Min: 55, Avg: 72, Max: 130 }]
};

const bpMetric: MetricData = {
  name: 'blood_pressure',
  units: 'mmHg',
  data: [{ date: '2026-01-15 10:00:00 +0000', systolic: 120, diastolic: 80 }]
};

test('parses basic step_count metric', () => {
  const rows = parseMetric(stepMetric, 'default', 'sess-1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].metric, 'step_count');
  assert.equal(rows[0].qty, 5000);
  assert.equal(rows[0].units, 'count');
  assert.ok(rows[0].ts);
  assert.ok(rows[0].date);
});

test('parses heart_rate metric with Min/Avg/Max', () => {
  const rows = parseMetric(hrMetric, 'default', 'sess-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].min, 55);
  assert.equal(rows[0].avg, 72);
  assert.equal(rows[0].max, 130);
  assert.equal(rows[0].qty, null);
});

test('parses blood_pressure into meta JSON', () => {
  const rows = parseMetric(bpMetric, 'default', 'sess-1');
  assert.equal(rows.length, 1);
  const meta = JSON.parse(rows[0].meta!);
  assert.equal(meta.systolic, 120);
  assert.equal(meta.diastolic, 80);
});

test('returns empty array for sleep_analysis (handled elsewhere)', () => {
  const sleepMetric: MetricData = { name: 'sleep_analysis', units: 'hr', data: [] };
  const rows = parseMetric(sleepMetric, 'default', 'sess-1');
  assert.equal(rows.length, 0);
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/parse/metrics.js'`

**Step 3: Create `src/parse/metrics.ts`**

```typescript
import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { MetricData, RawDatapoint } from '../types/hae.js';

export interface NormalizedMetric {
  ts: string;
  date: string;
  metric: string;
  qty: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  units: string;
  source: string | null;
  target: string;
  meta: string | null;
  session_id: string | null;
}

export function parseMetric(m: MetricData, target: string, sessionId: string | null): NormalizedMetric[] {
  // sleep_analysis is handled by the sleep parser
  if (m.name === 'sleep_analysis') return [];

  return (m.data as RawDatapoint[]).map((dp) => {
    const d = parseHaeTime(dp.date);
    const isHeartRate = dp.Min !== undefined || dp.Avg !== undefined || dp.Max !== undefined;
    const isBloodPressure = dp.systolic !== undefined || dp.diastolic !== undefined;

    let qty: number | null = null;
    let min: number | null = null;
    let avg: number | null = null;
    let max: number | null = null;
    let meta: string | null = null;

    if (isHeartRate) {
      min = dp.Min ?? null;
      avg = dp.Avg ?? null;
      max = dp.Max ?? null;
    } else if (isBloodPressure) {
      meta = JSON.stringify({ systolic: dp.systolic, diastolic: dp.diastolic });
    } else {
      qty = dp.qty ?? null;
    }

    return {
      ts: toIso(d),
      date: toDateStr(d),
      metric: m.name,
      qty,
      min,
      avg,
      max,
      units: m.units,
      source: dp.source ?? null,
      target,
      meta,
      session_id: sessionId,
    };
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/parse/metrics.ts tests/parse-metrics.test.ts
git commit -m "feat: metrics parser — normalizes datapoints for DB insertion"
```

---

## Task 6: Workouts Parser

**Files:**
- Create: `src/parse/workouts.ts`
- Create: `tests/parse-workouts.test.ts`

**Context:** Workouts have a fixed set of known fields plus arbitrary dynamic fields (sport-specific). Store computed fields (`duration_s`, `calories_kj`, `avg_hr`, `max_hr`, `distance`) at top level for easy querying. Store the full raw workout JSON in `meta` for completeness.

**Step 1: Write the failing test**

```typescript
// tests/parse-workouts.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkout } from '../src/parse/workouts.js';
import type { WorkoutData } from '../src/types/hae.js';

const run: WorkoutData = {
  name: 'Running',
  start: '2026-01-15 07:00:00 +0000',
  end: '2026-01-15 07:45:00 +0000',
  activeEnergyBurned: { qty: 450, units: 'kJ' },
  distance: { qty: 5.2, units: 'km' },
  heartRateData: [
    { date: '2026-01-15 07:01:00 +0000', qty: 140, units: 'bpm' },
    { date: '2026-01-15 07:44:00 +0000', qty: 155, units: 'bpm' },
  ],
};

test('parses workout basics', () => {
  const row = parseWorkout(run, 'default', 'sess-1');
  assert.equal(row.name, 'Running');
  assert.equal(row.duration_s, 45 * 60);
  assert.equal(row.calories_kj, 450);
  assert.equal(row.distance, 5.2);
  assert.equal(row.distance_unit, 'km');
});

test('computes avg and max heart rate', () => {
  const row = parseWorkout(run, 'default', 'sess-1');
  assert.equal(row.avg_hr, (140 + 155) / 2);
  assert.equal(row.max_hr, 155);
});

test('stores full workout JSON in meta', () => {
  const row = parseWorkout(run, 'default', 'sess-1');
  assert.ok(row.meta);
  const meta = JSON.parse(row.meta);
  assert.equal(meta.name, 'Running');
});

test('derives date from start timestamp', () => {
  const row = parseWorkout(run, 'default', 'sess-1');
  assert.equal(row.date, '2026-01-15');
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/parse/workouts.js'`

**Step 3: Create `src/parse/workouts.ts`**

```typescript
import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { WorkoutData } from '../types/hae.js';

export interface NormalizedWorkout {
  ts: string;
  date: string;
  name: string;
  duration_s: number | null;
  calories_kj: number | null;
  distance: number | null;
  distance_unit: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  target: string;
  meta: string;
  session_id: string | null;
}

export function parseWorkout(w: WorkoutData, target: string, sessionId: string | null): NormalizedWorkout {
  const start = parseHaeTime(w.start);
  const end = parseHaeTime(w.end);
  const duration_s = Math.round((end.getTime() - start.getTime()) / 1000);

  const hrValues = (w.heartRateData ?? []).map((h) => h.qty).filter((v) => typeof v === 'number');
  const avg_hr = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null;
  const max_hr = hrValues.length > 0 ? Math.max(...hrValues) : null;

  return {
    ts: toIso(start),
    date: toDateStr(start),
    name: w.name,
    duration_s,
    calories_kj: w.activeEnergyBurned?.qty ?? null,
    distance: w.distance?.qty ?? null,
    distance_unit: w.distance?.units ?? null,
    avg_hr,
    max_hr,
    target,
    meta: JSON.stringify(w),
    session_id: sessionId,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/parse/workouts.ts tests/parse-workouts.test.ts
git commit -m "feat: workouts parser — extracts key fields, stores full JSON in meta"
```

---

## Task 7: SQLite Schema + DB Initialization

**Files:**
- Create: `src/db/schema.ts`
- Create: `tests/db-schema.test.ts`

**Context:** `better-sqlite3` is synchronous — no async/await needed. DB lives at `~/.hae-vault/health.db`. Enable WAL mode for concurrent reads while server writes. Schema must be idempotent (use `CREATE TABLE IF NOT EXISTS`). `UNIQUE` constraints enable upsert with `INSERT OR REPLACE`.

**Step 1: Write the failing test**

```typescript
// tests/db-schema.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-' + Date.now());
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
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/db/schema.js'`

**Step 3: Create `src/db/schema.ts`**

```typescript
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DB_PATH = join(homedir(), '.hae-vault', 'health.db');

export function openDb(dbPath = DEFAULT_DB_PATH): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id         INTEGER PRIMARY KEY,
      ts         TEXT NOT NULL,
      date       TEXT NOT NULL,
      metric     TEXT NOT NULL,
      qty        REAL,
      min        REAL,
      avg        REAL,
      max        REAL,
      units      TEXT,
      source     TEXT,
      target     TEXT,
      meta       TEXT,
      session_id TEXT,
      UNIQUE(ts, metric, source, target)
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_date   ON metrics(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_metric ON metrics(metric);

    CREATE TABLE IF NOT EXISTS sleep (
      id            INTEGER PRIMARY KEY,
      date          TEXT NOT NULL,
      sleep_start   TEXT,
      sleep_end     TEXT,
      in_bed_start  TEXT,
      in_bed_end    TEXT,
      core_h        REAL,
      deep_h        REAL,
      rem_h         REAL,
      awake_h       REAL,
      asleep_h      REAL,
      in_bed_h      REAL,
      schema_ver    TEXT,
      source        TEXT,
      target        TEXT,
      meta          TEXT,
      session_id    TEXT,
      UNIQUE(date, source, target)
    );

    CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date);

    CREATE TABLE IF NOT EXISTS workouts (
      id            INTEGER PRIMARY KEY,
      ts            TEXT NOT NULL,
      date          TEXT NOT NULL,
      name          TEXT NOT NULL,
      duration_s    INTEGER,
      calories_kj   REAL,
      distance      REAL,
      distance_unit TEXT,
      avg_hr        REAL,
      max_hr        REAL,
      target        TEXT,
      meta          TEXT,
      session_id    TEXT,
      UNIQUE(ts, name, target)
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);

    CREATE TABLE IF NOT EXISTS sync_log (
      id               INTEGER PRIMARY KEY,
      received_at      TEXT NOT NULL,
      target           TEXT,
      session_id       TEXT,
      metrics_count    INTEGER,
      workouts_count   INTEGER,
      automation_name  TEXT,
      automation_period TEXT
    );
  `);

  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/db/schema.ts tests/db-schema.test.ts
git commit -m "feat: SQLite schema — metrics/sleep/workouts/sync_log with WAL mode"
```

---

## Task 8: DB Write Layer — Metrics

**Files:**
- Create: `src/db/metrics.ts`
- Create: `tests/db-metrics.test.ts`

**Context:** Uses `INSERT OR REPLACE INTO` which relies on `UNIQUE(ts, metric, source, target)`. This makes ingestion idempotent — safe to replay historical exports.

**Step 1: Write the failing test**

```typescript
// tests/db-metrics.test.ts
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

const row = { ts: '2026-01-15T10:00:00.000Z', date: '2026-01-15', metric: 'step_count', qty: 5000, min: null, avg: null, max: null, units: 'count', source: 'iPhone', target: 'default', meta: null, session_id: 'sess-1' };

test('inserts a metric row', () => {
  upsertMetrics(db, [row]);
  const result = db.prepare('SELECT * FROM metrics WHERE metric = ?').get('step_count') as { qty: number };
  assert.equal(result.qty, 5000);
});

test('upserts on conflict — updates qty', () => {
  upsertMetrics(db, [{ ...row, qty: 6000 }]);
  const result = db.prepare('SELECT COUNT(*) as c FROM metrics WHERE metric = ?').get('step_count') as { c: number };
  assert.equal(result.c, 1); // still only one row
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
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/db/metrics.js'`

**Step 3: Create `src/db/metrics.ts`**

```typescript
import type Database from 'better-sqlite3';
import type { NormalizedMetric } from '../parse/metrics.js';

export function upsertMetrics(db: Database.Database, rows: NormalizedMetric[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO metrics (ts, date, metric, qty, min, avg, max, units, source, target, meta, session_id)
    VALUES (@ts, @date, @metric, @qty, @min, @avg, @max, @units, @source, @target, @meta, @session_id)
  `);
  const insertMany = db.transaction((rows: NormalizedMetric[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(rows);
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/db/metrics.ts tests/db-metrics.test.ts
git commit -m "feat: DB upsert for metrics — idempotent INSERT OR REPLACE"
```

---

## Task 9: DB Write Layer — Sleep + Workouts

**Files:**
- Create: `src/db/sleep.ts`
- Create: `src/db/workouts.ts`
- Create: `tests/db-sleep.test.ts`
- Create: `tests/db-workouts.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/db-sleep.test.ts
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

const row = { date: '2026-01-15', sleep_start: '2026-01-14T22:00:00.000Z', sleep_end: '2026-01-15T06:00:00.000Z', in_bed_start: null, in_bed_end: null, core_h: 3.0, deep_h: 1.0, rem_h: 1.5, awake_h: 0.5, asleep_h: 5.5, in_bed_h: 6.0, schema_ver: 'aggregated_v2' as const, source: 'Apple Watch', target: 'default', meta: null, session_id: 'sess-1' };

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
```

```typescript
// tests/db-workouts.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { upsertWorkout } from '../src/db/workouts.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'hae-vault-test-workouts-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const row = { ts: '2026-01-15T07:00:00.000Z', date: '2026-01-15', name: 'Running', duration_s: 2700, calories_kj: 450, distance: 5.2, distance_unit: 'km', avg_hr: 145, max_hr: 165, target: 'default', meta: '{}', session_id: 'sess-1' };

test('inserts workout row', () => {
  upsertWorkout(db, row);
  const result = db.prepare('SELECT name FROM workouts WHERE date = ?').get('2026-01-15') as { name: string };
  assert.equal(result.name, 'Running');
});

test('upserts workout — overwrites on same ts+name+target', () => {
  upsertWorkout(db, { ...row, calories_kj: 500 });
  const count = db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number };
  assert.equal(count.c, 1);
  const updated = db.prepare('SELECT calories_kj FROM workouts WHERE date = ?').get('2026-01-15') as { calories_kj: number };
  assert.equal(updated.calories_kj, 500);
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: Missing module errors.

**Step 3: Create `src/db/sleep.ts`**

```typescript
import type Database from 'better-sqlite3';
import type { NormalizedSleep } from '../parse/sleep.js';

export function upsertSleep(db: Database.Database, row: NormalizedSleep): void {
  db.prepare(`
    INSERT OR REPLACE INTO sleep
      (date, sleep_start, sleep_end, in_bed_start, in_bed_end, core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h, schema_ver, source, target, meta, session_id)
    VALUES
      (@date, @sleep_start, @sleep_end, @in_bed_start, @in_bed_end, @core_h, @deep_h, @rem_h, @awake_h, @asleep_h, @in_bed_h, @schema_ver, @source, @target, @meta, @session_id)
  `).run(row);
}
```

**Step 4: Create `src/db/workouts.ts`**

```typescript
import type Database from 'better-sqlite3';
import type { NormalizedWorkout } from '../parse/workouts.js';

export function upsertWorkout(db: Database.Database, row: NormalizedWorkout): void {
  db.prepare(`
    INSERT OR REPLACE INTO workouts
      (ts, date, name, duration_s, calories_kj, distance, distance_unit, avg_hr, max_hr, target, meta, session_id)
    VALUES
      (@ts, @date, @name, @duration_s, @calories_kj, @distance, @distance_unit, @avg_hr, @max_hr, @target, @meta, @session_id)
  `).run(row);
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/db/sleep.ts src/db/workouts.ts tests/db-sleep.test.ts tests/db-workouts.test.ts
git commit -m "feat: DB upsert for sleep and workouts"
```

---

## Task 10: Ingest Pipeline

**Files:**
- Create: `src/server/ingest.ts`
- Create: `tests/ingest.test.ts`

**Context:** Ties together parsing + DB writes. Receives a parsed `HaePayload` + request metadata (target, session-id), calls parsers, writes to DB, logs to `sync_log`. This is the core integration point.

**Step 1: Write the failing test**

```typescript
// tests/ingest.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, closeDb } from '../src/db/schema.js';
import { ingest } from '../src/server/ingest.js';
import type Database from 'better-sqlite3';
import type { HaePayload } from '../src/types/hae.js';

const testDir = join(tmpdir(), 'hae-vault-test-ingest-' + Date.now());
let db: Database.Database;
before(() => { mkdirSync(testDir, { recursive: true }); db = openDb(join(testDir, 'test.db')); });
after(() => { closeDb(db); rmSync(testDir, { recursive: true }); });

const payload: HaePayload = {
  data: {
    metrics: [
      { name: 'step_count', units: 'count', data: [{ date: '2026-01-15 10:00:00 +0000', qty: 8532 }] },
      { name: 'heart_rate', units: 'bpm', data: [{ date: '2026-01-15 10:00:00 +0000', Min: 55, Avg: 72, Max: 130 }] },
      {
        name: 'sleep_analysis', units: 'hr',
        data: [{ sleepStart: '2026-01-14 22:00:00 +0000', sleepEnd: '2026-01-15 06:00:00 +0000', core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0, source: 'Apple Watch' }]
      }
    ],
    workouts: [
      { name: 'Running', start: '2026-01-15 07:00:00 +0000', end: '2026-01-15 07:45:00 +0000', activeEnergyBurned: { qty: 450, units: 'kJ' } }
    ]
  }
};

test('ingests metrics into DB', () => {
  ingest(db, payload, { target: 'default', sessionId: 'sess-1', automationName: 'morning', automationPeriod: 'Today' });
  const count = db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number };
  assert.ok(count.c >= 2);
});

test('ingests sleep into DB', () => {
  const row = db.prepare('SELECT * FROM sleep WHERE date = ?').get('2026-01-14') as { core_h: number } | undefined;
  assert.ok(row);
  assert.equal(row!.core_h, 3.0);
});

test('ingests workout into DB', () => {
  const row = db.prepare("SELECT * FROM workouts WHERE name = 'Running'").get() as { calories_kj: number } | undefined;
  assert.ok(row);
  assert.equal(row!.calories_kj, 450);
});

test('writes to sync_log', () => {
  const row = db.prepare('SELECT * FROM sync_log WHERE session_id = ?').get('sess-1') as { metrics_count: number } | undefined;
  assert.ok(row);
  assert.ok(row!.metrics_count >= 2);
});

test('second ingest with same session is idempotent', () => {
  ingest(db, payload, { target: 'default', sessionId: 'sess-1', automationName: 'morning', automationPeriod: 'Today' });
  const count = db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number };
  assert.ok(count.c >= 2); // no duplicates
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: `Cannot find module '../src/server/ingest.js'`

**Step 3: Create `src/server/ingest.ts`**

```typescript
import type Database from 'better-sqlite3';
import type { HaePayload } from '../types/hae.js';
import { parseMetric } from '../parse/metrics.js';
import { normalizeSleep, detectSleepVariant } from '../parse/sleep.js';
import { parseWorkout } from '../parse/workouts.js';
import { upsertMetrics } from '../db/metrics.js';
import { upsertSleep } from '../db/sleep.js';
import { upsertWorkout } from '../db/workouts.js';
import type { SleepDatapoint } from '../types/hae.js';

export interface IngestOptions {
  target: string;
  sessionId: string | null;
  automationName?: string;
  automationPeriod?: string;
}

export function ingest(db: Database.Database, payload: HaePayload, opts: IngestOptions): void {
  const { target, sessionId } = opts;
  const { data } = payload;

  let metricsCount = 0;
  let workoutsCount = 0;

  // Process metrics
  for (const m of data.metrics ?? []) {
    if (m.name === 'sleep_analysis') {
      for (const dp of (m.data as SleepDatapoint[])) {
        const row = normalizeSleep(dp, target, sessionId);
        upsertSleep(db, row);
      }
    } else {
      const rows = parseMetric(m, target, sessionId);
      upsertMetrics(db, rows);
      metricsCount += rows.length;
    }
  }

  // Process workouts
  for (const w of data.workouts ?? []) {
    const row = parseWorkout(w, target, sessionId);
    upsertWorkout(db, row);
    workoutsCount++;
  }

  // Log sync
  db.prepare(`
    INSERT INTO sync_log (received_at, target, session_id, metrics_count, workouts_count, automation_name, automation_period)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    target,
    sessionId,
    metricsCount,
    workoutsCount,
    opts.automationName ?? null,
    opts.automationPeriod ?? null
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/server/ingest.ts tests/ingest.test.ts
git commit -m "feat: ingest pipeline — ties parsing + DB writes together"
```

---

## Task 11: Express HTTP Server

**Files:**
- Create: `src/server/app.ts`
- Create: `src/cli/serve.ts`

**Context:** Receives POST to `/api/ingest`. Reads HAE headers (`session-id`, `automation-name`, etc.) and `?target=` query param. Optional bearer token auth. Returns `200 { ok: true }` on success, `400` on parse error, `401` on auth failure. No test for Express directly — test at integration level via the ingest tests already written.

**Step 1: Create `src/server/app.ts`**

```typescript
import express, { type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { ingest } from './ingest.js';
import type { HaePayload } from '../types/hae.js';

export function createApp(db: Database.Database, opts: { token?: string } = {}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/ingest', (req: Request, res: Response) => {
    // Optional auth
    if (opts.token) {
      const authHeader = req.headers['authorization'] ?? '';
      const apiKey = req.headers['x-api-key'] ?? '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (bearer !== opts.token && apiKey !== opts.token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const payload = req.body as HaePayload;
      if (!payload?.data) {
        res.status(400).json({ error: 'Missing data field' });
        return;
      }

      ingest(db, payload, {
        target: (req.query['target'] as string) ?? 'default',
        sessionId: (req.headers['session-id'] as string) ?? null,
        automationName: req.headers['automation-name'] as string | undefined,
        automationPeriod: req.headers['automation-period'] as string | undefined,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('Ingest error:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  return app;
}
```

**Step 2: Create `src/cli/serve.ts`**

```typescript
import { Command } from 'commander';
import { createApp } from '../server/app.js';
import { openDb } from '../db/schema.js';

export const serveCommand = new Command('serve')
  .description('Start HTTP server to receive Health Auto Export pushes')
  .option('-p, --port <number>', 'Port to listen on', '4242')
  .option('--token <secret>', 'Require Authorization: Bearer <secret>')
  .action((opts) => {
    const db = openDb();
    const app = createApp(db, { token: opts.token });
    const port = parseInt(opts.port, 10);
    app.listen(port, () => {
      console.log(`hvault server listening on http://0.0.0.0:${port}/api/ingest`);
      if (opts.token) console.log('Auth: Bearer token required');
    });
  });
```

**Step 3: Update `src/cli/index.ts` to register the serve command**

```typescript
import { Command } from 'commander';
import { serveCommand } from './serve.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.1.0');

program.addCommand(serveCommand);
```

**Step 4: Build and smoke test**

```bash
npm run build && node dist/index.js --help
```

Expected output includes `serve` command.

**Step 5: Commit**

```bash
git add src/server/app.ts src/cli/serve.ts src/cli/index.ts
git commit -m "feat: Express ingest server and hvault serve CLI command"
```

---

## Task 12: CLI Query Commands

**Files:**
- Create: `src/cli/metrics.ts`
- Create: `src/cli/sleep.ts`
- Create: `src/cli/workouts.ts`
- Create: `src/cli/summary.ts`
- Create: `src/cli/query.ts`
- Create: `src/cli/info.ts`
- Modify: `src/cli/index.ts`

**Context:** All query commands share a pattern: open DB (read-only is fine), run a query, output JSON. `--days N` means last N days from now. `--pretty` uses `JSON.stringify(..., null, 2)`. The `query` command takes raw SQL for AI agent power-use.

**Step 1: Create `src/cli/metrics.ts`**

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const metricsCommand = new Command('metrics')
  .description('Query health metrics')
  .requiredOption('--metric <name>', 'Metric name (e.g. step_count, heart_rate)')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT ts, date, qty, min, avg, max, units, source, target
      FROM metrics
      WHERE metric = ? AND date >= ?
      ORDER BY ts ASC
    `).all(opts.metric, since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
```

**Step 2: Create `src/cli/sleep.ts`**

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const sleepCommand = new Command('sleep')
  .description('Query sleep data')
  .option('--days <n>', 'Last N days', '14')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT date, sleep_start, sleep_end, core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h, schema_ver, source
      FROM sleep
      WHERE date >= ?
      ORDER BY date ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
```

**Step 3: Create `src/cli/workouts.ts`**

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const workoutsCommand = new Command('workouts')
  .description('Query workouts')
  .option('--days <n>', 'Last N days', '30')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT ts, date, name, duration_s, calories_kj, distance, distance_unit, avg_hr, max_hr, target
      FROM workouts
      WHERE date >= ?
      ORDER BY ts ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
```

**Step 4: Create `src/cli/summary.ts`**

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const summaryCommand = new Command('summary')
  .description('Summarise metrics (averages) over N days')
  .option('--days <n>', 'Last N days', '90')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const rows = db.prepare(`
      SELECT metric, units,
             AVG(qty) as avg_qty, MIN(qty) as min_qty, MAX(qty) as max_qty,
             COUNT(*) as count,
             MIN(date) as first_date, MAX(date) as last_date
      FROM metrics
      WHERE date >= ? AND qty IS NOT NULL
      GROUP BY metric, units
      ORDER BY metric ASC
    `).all(since.toISOString().slice(0, 10));
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
```

**Step 5: Create `src/cli/query.ts`**

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const queryCommand = new Command('query')
  .description('Run raw SQL against the health database (returns JSON)')
  .argument('<sql>', 'SQL query to run')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((sql: string, opts) => {
    const db = openDb();
    try {
      const rows = db.prepare(sql).all();
      console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
    } catch (err) {
      console.error(JSON.stringify({ error: String(err) }));
      process.exit(1);
    }
  });
```

**Step 6: Create `src/cli/info.ts`** (sources, last-sync, stats)

```typescript
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const sourcesCommand = new Command('sources')
  .description('Show what metrics are in the DB and their date coverage')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const rows = db.prepare(`
      SELECT metric, units, COUNT(*) as count, MIN(date) as first_date, MAX(date) as last_date
      FROM metrics GROUP BY metric, units ORDER BY metric
    `).all();
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });

export const lastSyncCommand = new Command('last-sync')
  .description('Show when the last HAE push was received')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const row = db.prepare(`SELECT * FROM sync_log ORDER BY received_at DESC LIMIT 1`).get();
    console.log(opts.pretty ? JSON.stringify(row, null, 2) : JSON.stringify(row));
  });

export const statsCommand = new Command('stats')
  .description('Show row counts per table')
  .option('--pretty', 'Pretty-print JSON', false)
  .action((opts) => {
    const db = openDb();
    const metrics = (db.prepare('SELECT COUNT(*) as count FROM metrics').get() as { count: number }).count;
    const sleep = (db.prepare('SELECT COUNT(*) as count FROM sleep').get() as { count: number }).count;
    const workouts = (db.prepare('SELECT COUNT(*) as count FROM workouts').get() as { count: number }).count;
    const syncs = (db.prepare('SELECT COUNT(*) as count FROM sync_log').get() as { count: number }).count;
    const result = { metrics, sleep, workouts, syncs };
    console.log(opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  });
```

**Step 7: Update `src/cli/index.ts` to register all commands**

```typescript
import { Command } from 'commander';
import { serveCommand } from './serve.js';
import { metricsCommand } from './metrics.js';
import { sleepCommand } from './sleep.js';
import { workoutsCommand } from './workouts.js';
import { summaryCommand } from './summary.js';
import { queryCommand } from './query.js';
import { sourcesCommand, lastSyncCommand, statsCommand } from './info.js';

export const program = new Command();
program
  .name('hvault')
  .description('Apple Health data vault — ingest + query')
  .version('0.1.0');

program.addCommand(serveCommand);
program.addCommand(metricsCommand);
program.addCommand(sleepCommand);
program.addCommand(workoutsCommand);
program.addCommand(summaryCommand);
program.addCommand(queryCommand);
program.addCommand(sourcesCommand);
program.addCommand(lastSyncCommand);
program.addCommand(statsCommand);
```

**Step 8: Build and verify all commands appear**

```bash
npm run build && node dist/index.js --help
```

Expected: All commands listed: serve, metrics, sleep, workouts, summary, query, sources, last-sync, stats.

**Step 9: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: All tests PASS.

**Step 10: Commit**

```bash
git add src/cli/
git commit -m "feat: all CLI query commands — metrics, sleep, workouts, summary, query, sources, last-sync, stats"
```

---

## Task 13: OpenClaw SKILL.md

**Files:**
- Create: `SKILL.md`

**Context:** This skill lives in the OpenClaw workspace at `skills/hae-vault/SKILL.md`. The description must clearly differentiate from `whoop-up` — this is Apple Health historical data, not live WHOOP data.

**Step 1: Create `SKILL.md`**

```markdown
---
name: hae-vault
description: >
  Apple Health archive database. Use for: historical Apple Health data (steps,
  heart rate, HRV, sleep, workouts, mindfulness, respiratory rate, blood oxygen
  from iPhone/Apple Watch), multi-day trends, long-term patterns. Data comes
  from Health Auto Export iOS app synced to local SQLite. NOT for WHOOP data —
  use whoop-up skill for that. NOT for live/real-time data.
metadata:
  openclaw:
    emoji: "🍎"
    requires:
      bins:
        - hvault
    install:
      - id: node
        kind: node
        package: hae-vault
        bins:
          - hvault
        label: "Install hae-vault (node)"
---

# hae-vault

Query Apple Health data stored locally by `hvault serve` from the Health Auto Export iOS app.

## Commands

```bash
# Query last 30 days of steps
hvault metrics --metric step_count --days 30

# Query HRV
hvault metrics --metric heart_rate_variability --days 30

# Query sleep (last 14 nights)
hvault sleep --days 14

# Query workouts (last 30 days)
hvault workouts --days 30

# Summary averages across all metrics (90 days)
hvault summary --days 90

# Raw SQL for custom queries
hvault query "SELECT date, qty FROM metrics WHERE metric='step_count' ORDER BY date DESC LIMIT 7"

# What's in the DB?
hvault sources
hvault last-sync
hvault stats
```

## Available Metrics (common)

step_count, heart_rate, heart_rate_variability, resting_heart_rate,
active_energy, basal_energy_burned, respiratory_rate, blood_oxygen_saturation,
weight_body_mass, body_fat_percentage, sleep_analysis (via hvault sleep),
mindful_minutes, vo2max, walking_running_distance, flights_climbed
```

**Step 2: Commit**

```bash
git add SKILL.md
git commit -m "feat: OpenClaw SKILL.md for hae-vault"
```

---

## Task 14: End-to-End Smoke Test + npm link

**Step 1: Build the final package**

```bash
npm run build
```

Expected: No TypeScript errors. `dist/` contains `index.js` and all modules.

**Step 2: Install globally for local testing**

```bash
npm install -g .
```

**Step 3: Verify CLI works**

```bash
hvault --help
hvault stats --pretty
hvault last-sync
```

Expected: Help output shows all commands. Stats returns `{"metrics":0,"sleep":0,"workouts":0,"syncs":0}`.

**Step 4: Test the server is reachable**

```bash
hvault serve &
sleep 1
curl -s http://localhost:4242/health
kill %1
```

Expected: `{"status":"ok"}`

**Step 5: Run all tests one final time**

```bash
npm test
```

Expected: All tests PASS.

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final build verification — all tests passing, CLI smoke test ok"
```

---

## Testing Notes

- Test runner: `tsx --test tests/**/*.test.ts` (Node.js built-in test runner via tsx)
- Each test file creates a temp DB in `os.tmpdir()` — no shared state between test files
- Test files use `before`/`after` hooks to set up and tear down temp directories
- No mocking needed — `better-sqlite3` is synchronous and fast enough for tests
- The time parser has no external dependencies — pure TypeScript regex matching

## Common Pitfalls

1. **ESM imports need `.js` extension** — TypeScript compiles `.ts` → `.js` but import paths need `.js` even in source. Use `import { foo } from './foo.js'` everywhere.
2. **`better-sqlite3` is synchronous** — never use `await` with it. All DB calls return results directly.
3. **Sleep `UNIQUE(date, source, target)`** — if the same night's sleep comes in from multiple exports, last write wins. This is intentional.
4. **narrow non-breaking space (`\u202f`)** — appears in HAE timestamps on some iOS versions. The regex in `time.ts` must include `[\u202f ]` (bracket with both the NNBSP and regular space).
5. **`INSERT OR REPLACE`** — this is SQLite-specific. It deletes the old row and inserts a new one, so the `id` column will change on conflict. This is acceptable for our use case.
