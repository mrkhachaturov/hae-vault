# hae-vault README, Dashboard & CLI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a rich terminal dashboard, trends, colored summary to hae-vault CLI; write full README + COMMANDS docs; configure package.json and push to GitHub.

**Architecture:** No new dependencies. Pure string formatting in TypeScript. Three new/modified CLI files (`dashboard.ts`, `trends.ts`, `summary.ts`). All queries use existing `openDb()` + better-sqlite3. Display logic is self-contained — no shared formatter module (YAGNI).

**Tech Stack:** TypeScript, better-sqlite3, Commander.js, Node.js 22+

---

## Context

- **CLI binary:** `hvault` (package `hae-vault`)
- **DB path:** `~/.hae-vault/health.db` (via `openDb()` from `src/db/schema.ts`)
- **Build:** `npm run build` (tsc → dist/); dev run: `npm run dev -- <cmd>`
- **Test:** `npm test` (tsx --test tests/**/*.test.ts)
- **Schema key facts:**
  - `metrics(ts, date, metric, qty, min, avg, max, units, source, target)`
  - `sleep(date, sleep_start, sleep_end, core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h, source)`
  - `workouts(ts, date, name, duration_s, calories_kj, distance, distance_unit, avg_hr, max_hr, target)`
  - `sync_log(received_at, target, metrics_count, workouts_count)`
  - `import_log(filename, file_hash, imported_at, metrics_added, sleep_added, workouts_added)`
  - Sleep light hours = `asleep_h - deep_h - rem_h` (no separate column)
  - `duration_s` is seconds; `calories_kj` is kilojoules (÷ 4.184 = kcal)
- **Existing CLI files:** `src/cli/{index,serve,import,watch,metrics,sleep,workouts,summary,query,info}.ts`

---

## Task 1: Update package.json

**Files:**
- Modify: `package.json`

**Step 1: Add metadata fields**

Edit `package.json` — add these fields after `"license": "MIT"`:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/mrkhachaturov/hae-vault.git"
},
"homepage": "https://github.com/mrkhachaturov/hae-vault#readme",
"bugs": {
  "url": "https://github.com/mrkhachaturov/hae-vault/issues"
},
"keywords": [
  "apple-health",
  "health-auto-export",
  "sqlite",
  "cli",
  "hvault",
  "sleep",
  "hrv",
  "steps",
  "fitness",
  "hae"
],
```

Final `package.json` (complete):

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
  "keywords": [
    "apple-health",
    "health-auto-export",
    "sqlite",
    "cli",
    "hvault",
    "sleep",
    "hrv",
    "steps",
    "fitness",
    "hae"
  ],
  "author": "Ruben Khachaturov <mr.kha4a2rov@protonmail.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/mrkhachaturov/hae-vault.git"
  },
  "homepage": "https://github.com/mrkhachaturov/hae-vault#readme",
  "bugs": {
    "url": "https://github.com/mrkhachaturov/hae-vault/issues"
  },
  "dependencies": {
    "adm-zip": "^0.5.16",
    "better-sqlite3": "^12.6.2",
    "commander": "^12.1.0",
    "dotenv": "^17.3.1",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.7",
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```

Expected: `valid`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add repository/homepage/bugs/keywords to package.json"
```

---

## Task 2: Create `src/cli/dashboard.ts`

**Files:**
- Create: `src/cli/dashboard.ts`
- Modify: `src/cli/index.ts`

**Step 1: Create the file**

```typescript
// src/cli/dashboard.ts
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

function fmt1(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1);
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n).toLocaleString();
}

function sec2min(s: number | null | undefined): string {
  if (s == null) return '—';
  return `${Math.round(s / 60)}min`;
}

function kj2kcal(kj: number | null | undefined): string {
  if (kj == null) return '—';
  return `${Math.round(kj / 4.184)} kcal`;
}

function arrow(first: number, last: number): string {
  const delta = last - first;
  if (Math.abs(delta) < 0.01 * Math.abs(first || 1)) return '→';
  return delta > 0 ? '↑' : '↓';
}

function ruler(label: string, width = 43): string {
  const inner = `── ${label} `;
  return inner + '─'.repeat(Math.max(0, width - inner.length));
}

function workoutEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('run')) return '🏃';
  if (n.includes('walk')) return '🚶';
  if (n.includes('cycl') || n.includes('bike')) return '🚴';
  if (n.includes('swim')) return '🏊';
  if (n.includes('yoga')) return '🧘';
  if (n.includes('strength') || n.includes('weight') || n.includes('lift')) return '🏋️';
  if (n.includes('hike')) return '🥾';
  return '🏅';
}

function latestMetric(
  db: ReturnType<typeof openDb>,
  metricName: string,
  days = 7
): number | null {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const row = db.prepare(
    `SELECT qty FROM metrics WHERE metric = ? AND date >= ? AND qty IS NOT NULL ORDER BY ts DESC LIMIT 1`
  ).get(metricName, since.toISOString().slice(0, 10)) as { qty: number } | undefined;
  return row?.qty ?? null;
}

function dailyAvgs(
  db: ReturnType<typeof openDb>,
  metricName: string,
  days: number
): number[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.prepare(
    `SELECT date, AVG(qty) as avg_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since.toISOString().slice(0, 10)) as { date: string; avg_qty: number }[];
  return rows.map(r => r.avg_qty);
}

function sleepDailyAvgs(
  db: ReturnType<typeof openDb>,
  days: number
): number[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = db.prepare(
    `SELECT asleep_h FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL ORDER BY date ASC`
  ).all(since.toISOString().slice(0, 10)) as { asleep_h: number }[];
  return rows.map(r => r.asleep_h);
}

function trendLine(
  values: number[],
  label: string,
  unit: string,
  round = false
): string {
  if (values.length < 2) return '';
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const first = values[0];
  const last = values[values.length - 1];
  const dir = arrow(first, last);
  const fmt = round ? fmtInt : fmt1;
  return `   ${pad(label + ':', 14)} ${fmt(first)} → ${fmt(last)}${unit} ${dir}  (avg ${fmt(avg)})`;
}

// ── command ───────────────────────────────────────────────────────────────────

export const dashboardCommand = new Command('dashboard')
  .description('Terminal dashboard: sleep, activity, heart health, workouts, trends')
  .option('--days <n>', 'Trend window in days', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb();
    const trendDays = parseInt(opts.days, 10);
    const today = new Date().toISOString().slice(0, 10);

    // ── sleep (last night) ─────────────────────────────────────────────────
    const sleep = db.prepare(
      `SELECT * FROM sleep ORDER BY date DESC LIMIT 1`
    ).get() as {
      date: string; asleep_h: number | null; in_bed_h: number | null;
      deep_h: number | null; rem_h: number | null; awake_h: number | null;
      source: string | null;
    } | undefined;

    // ── activity (today, fallback last 2 days) ─────────────────────────────
    const steps = latestMetric(db, 'step_count', 2);
    const activeCal = latestMetric(db, 'active_energy_burned', 2);
    const standHours = latestMetric(db, 'apple_stand_hour', 2);

    // ── heart health (last 7 days) ─────────────────────────────────────────
    const restingHR = latestMetric(db, 'resting_heart_rate', 7);
    const hrv = latestMetric(db, 'heart_rate_variability_sdnn', 7);

    // ── recent workouts ────────────────────────────────────────────────────
    const workouts = db.prepare(
      `SELECT date, name, duration_s, calories_kj, avg_hr FROM workouts ORDER BY ts DESC LIMIT 5`
    ).all() as { date: string; name: string; duration_s: number | null; calories_kj: number | null; avg_hr: number | null }[];

    // ── trends ────────────────────────────────────────────────────────────
    const stepTrend = dailyAvgs(db, 'step_count', trendDays);
    const hrTrend = dailyAvgs(db, 'resting_heart_rate', trendDays);
    const hrvTrend = dailyAvgs(db, 'heart_rate_variability_sdnn', trendDays);
    const sleepTrend = sleepDailyAvgs(db, trendDays);

    // ── vault stats ───────────────────────────────────────────────────────
    const metricsCount = (db.prepare('SELECT COUNT(*) as c FROM metrics').get() as { c: number }).c;
    const sleepCount = (db.prepare('SELECT COUNT(*) as c FROM sleep').get() as { c: number }).c;
    const workoutsCount = (db.prepare('SELECT COUNT(*) as c FROM workouts').get() as { c: number }).c;
    const lastSync = db.prepare('SELECT received_at FROM sync_log ORDER BY received_at DESC LIMIT 1').get() as { received_at: string } | undefined;

    if (opts.json) {
      console.log(JSON.stringify({
        date: today,
        sleep: sleep ?? null,
        activity: { steps, activeCal, standHours },
        heartHealth: { restingHR, hrv },
        workouts,
        trends: { steps: stepTrend, restingHR: hrTrend, hrv: hrvTrend, sleep: sleepTrend },
        vault: { metricsCount, sleepCount, workoutsCount, lastSync: lastSync?.received_at ?? null }
      }, null, 2));
      return;
    }

    const lines: string[] = [];
    lines.push(`📅 ${today} | Apple Health Vault`);
    lines.push('');

    // sleep
    lines.push(ruler('Sleep (last night)'));
    if (sleep) {
      const eff = sleep.in_bed_h && sleep.asleep_h
        ? Math.round((sleep.asleep_h / sleep.in_bed_h) * 100) : null;
      lines.push(`😴 ${fmt1(sleep.asleep_h)}h | Efficiency: ${eff != null ? eff + '%' : '—'}`);
      const light = (sleep.asleep_h ?? 0) - (sleep.deep_h ?? 0) - (sleep.rem_h ?? 0);
      const deepPct = sleep.asleep_h ? Math.round(((sleep.deep_h ?? 0) / sleep.asleep_h) * 100) : 0;
      const remPct = sleep.asleep_h ? Math.round(((sleep.rem_h ?? 0) / sleep.asleep_h) * 100) : 0;
      const lightPct = sleep.asleep_h ? Math.round((light / sleep.asleep_h) * 100) : 0;
      lines.push(`   Deep: ${fmt1(sleep.deep_h)}h (${deepPct}%) | REM: ${fmt1(sleep.rem_h)}h (${remPct}%) | Light: ${fmt1(light)}h (${lightPct}%)`);
      lines.push(`   Awake: ${fmt1(sleep.awake_h)}h | Source: ${sleep.source ?? '—'}`);
    } else {
      lines.push('   No sleep data');
    }
    lines.push('');

    // activity
    lines.push(ruler('Activity (recent)'));
    const actParts: string[] = [];
    if (steps != null) actParts.push(`👟 ${fmtInt(steps)} steps`);
    if (activeCal != null) actParts.push(`🔥 ${fmtInt(activeCal)} kcal active`);
    if (actParts.length > 0) {
      lines.push(actParts.join(' | '));
      if (standHours != null) lines.push(`   Stand hours: ${Math.round(standHours)}`);
    } else {
      lines.push('   No activity data');
    }
    lines.push('');

    // heart health
    lines.push(ruler('Heart Health'));
    const hh: string[] = [];
    if (restingHR != null) hh.push(`💓 Resting HR: ${Math.round(restingHR)}bpm`);
    if (hrv != null) hh.push(`HRV: ${Math.round(hrv)}ms`);
    lines.push(hh.length > 0 ? hh.join(' | ') : '   No heart data');
    lines.push('');

    // workouts
    lines.push(ruler('Recent Workouts'));
    if (workouts.length > 0) {
      for (const w of workouts) {
        const emoji = workoutEmoji(w.name);
        const namePadded = pad(w.name, 18);
        const dur = sec2min(w.duration_s);
        const cal = kj2kcal(w.calories_kj);
        lines.push(`${emoji} ${w.date}  ${namePadded} ${dur}  ${cal}`);
      }
    } else {
      lines.push('   No workout data');
    }
    lines.push('');

    // trends
    lines.push(ruler(`${trendDays}-Day Trends`));
    const tl: string[] = [
      trendLine(stepTrend, 'Steps', '', true),
      trendLine(sleepTrend, 'Sleep', 'h'),
      trendLine(hrTrend, 'Resting HR', 'bpm', true),
      trendLine(hrvTrend, 'HRV', 'ms', true),
    ].filter(Boolean);
    if (tl.length > 0) lines.push(...tl);
    else lines.push('   Insufficient data for trends');
    lines.push('');

    // vault stats
    lines.push(ruler('Vault Stats'));
    lines.push(`   Metrics: ${metricsCount.toLocaleString()} | Sleep: ${sleepCount} | Workouts: ${workoutsCount}`);
    lines.push(`   Last sync: ${lastSync?.received_at ? new Date(lastSync.received_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never'}`);

    console.log(lines.join('\n'));
  });
```

**Step 2: Register in `src/cli/index.ts`**

Add at top (after existing imports):

```typescript
import { dashboardCommand } from './dashboard.js';
```

Add before `program.addCommand(sourcesCommand)`:

```typescript
program.addCommand(dashboardCommand);
```

**Step 3: Build**

```bash
npm run build
```

Expected: zero TypeScript errors.

**Step 4: Smoke test**

```bash
npm run dev -- dashboard
```

Expected: renders the dashboard with real data from `~/.hae-vault/health.db`. Sections show data or graceful `—` for missing metrics.

```bash
npm run dev -- dashboard --json
```

Expected: valid JSON object.

**Step 5: Commit**

```bash
git add src/cli/dashboard.ts src/cli/index.ts
git commit -m "feat: add hvault dashboard command"
```

---

## Task 3: Create `src/cli/trends.ts`

**Files:**
- Create: `src/cli/trends.ts`
- Modify: `src/cli/index.ts`

**Step 1: Create the file**

```typescript
// src/cli/trends.ts
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

function fmt1(n: number): string {
  return n.toFixed(1);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function arrow(values: number[]): string {
  if (values.length < 2) return '→';
  const half = Math.floor(values.length / 2);
  const firstHalfAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfAvg = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
  const delta = secondHalfAvg - firstHalfAvg;
  if (Math.abs(delta) < 0.01 * Math.abs(firstHalfAvg || 1)) return '→';
  return delta > 0 ? '↑' : '↓';
}

interface MetricTrendRow { date: string; avg_qty: number }

function metricTrend(
  db: ReturnType<typeof openDb>,
  metricName: string,
  since: string
): { values: number[]; avg: number; min: number; max: number } | null {
  const rows = db.prepare(
    `SELECT date, AVG(qty) as avg_qty FROM metrics
     WHERE metric = ? AND date >= ? AND qty IS NOT NULL
     GROUP BY date ORDER BY date ASC`
  ).all(metricName, since) as MetricTrendRow[];
  if (rows.length === 0) return null;
  const values = rows.map(r => r.avg_qty);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { values, avg, min: Math.min(...values), max: Math.max(...values) };
}

function sleepTrend(
  db: ReturnType<typeof openDb>,
  since: string
): { values: number[]; avg: number; min: number; max: number } | null {
  const rows = db.prepare(
    `SELECT asleep_h FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL ORDER BY date ASC`
  ).all(since) as { asleep_h: number }[];
  if (rows.length === 0) return null;
  const values = rows.map(r => r.asleep_h);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { values, avg, min: Math.min(...values), max: Math.max(...values) };
}

export const trendsCommand = new Command('trends')
  .description('Multi-metric trend analysis with averages, ranges, and direction arrows')
  .option('--days <n>', 'Days of history', '7')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const db = openDb();
    const days = parseInt(opts.days, 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const steps = metricTrend(db, 'step_count', sinceStr);
    const restingHR = metricTrend(db, 'resting_heart_rate', sinceStr);
    const hrv = metricTrend(db, 'heart_rate_variability_sdnn', sinceStr);
    const activeCal = metricTrend(db, 'active_energy_burned', sinceStr);
    const sleep = sleepTrend(db, sinceStr);

    if (opts.json) {
      console.log(JSON.stringify({ days, steps, restingHR, hrv, activeCal, sleep }, null, 2));
      return;
    }

    const lines: string[] = [];
    lines.push(`📊 ${days}-Day Trends`);
    lines.push('');

    function row(
      emoji: string,
      label: string,
      data: { values: number[]; avg: number; min: number; max: number } | null,
      unit: string,
      round: boolean
    ): void {
      if (!data) return;
      const dir = arrow(data.values);
      const fmt = round ? fmtInt : fmt1;
      lines.push(`${emoji} ${label}: ${fmt(data.avg)} avg (${fmt(data.min)}–${fmt(data.max)}) ${dir}`);
    }

    row('👟', 'Steps', steps, '', true);
    row('💓', 'Resting HR', restingHR, 'bpm', true);
    row('🧠', 'HRV', hrv, 'ms', true);
    row('😴', 'Sleep', sleep, 'h', false);
    row('🔥', 'Active Cal', activeCal, 'kcal', true);

    if (lines.length === 2) {
      lines.push('   No trend data available');
    }

    console.log(lines.join('\n'));
  });
```

**Step 2: Register in `src/cli/index.ts`**

Add import:

```typescript
import { trendsCommand } from './trends.js';
```

Add command:

```typescript
program.addCommand(trendsCommand);
```

**Step 3: Build**

```bash
npm run build
```

Expected: zero TypeScript errors.

**Step 4: Smoke test**

```bash
npm run dev -- trends
npm run dev -- trends --days 30
npm run dev -- trends --json
```

**Step 5: Commit**

```bash
git add src/cli/trends.ts src/cli/index.ts
git commit -m "feat: add hvault trends command"
```

---

## Task 4: Enhance `src/cli/summary.ts` with `--color`

**Files:**
- Modify: `src/cli/summary.ts`

**Step 1: Rewrite the file**

Replace entirely with:

```typescript
// src/cli/summary.ts
import { Command } from 'commander';
import { openDb } from '../db/schema.js';

export const summaryCommand = new Command('summary')
  .description('Summarise metrics (averages) over N days')
  .option('--days <n>', 'Last N days', '90')
  .option('--pretty', 'Pretty-print JSON', false)
  .option('-c, --color', 'Pretty terminal output with emoji indicators', false)
  .option('--json', 'Raw JSON (alias for default behavior)', false)
  .action((opts) => {
    const db = openDb();
    const since = new Date();
    since.setDate(since.getDate() - parseInt(opts.days, 10));
    const sinceStr = since.toISOString().slice(0, 10);

    if (opts.color) {
      // ── colored terminal output ──────────────────────────────────────────
      const days = parseInt(opts.days, 10);

      function avgMetric(metricName: string): number | null {
        const row = db.prepare(
          `SELECT AVG(qty) as avg FROM metrics WHERE metric = ? AND date >= ? AND qty IS NOT NULL`
        ).get(metricName, sinceStr) as { avg: number | null } | undefined;
        return row?.avg ?? null;
      }

      const steps = avgMetric('step_count');
      const restingHR = avgMetric('resting_heart_rate');
      const hrv = avgMetric('heart_rate_variability_sdnn');
      const activeCal = avgMetric('active_energy_burned');

      const sleepRow = db.prepare(
        `SELECT AVG(asleep_h) as avg FROM sleep WHERE date >= ? AND asleep_h IS NOT NULL`
      ).get(sinceStr) as { avg: number | null } | undefined;
      const sleep = sleepRow?.avg ?? null;

      const lines: string[] = [`📊 ${days}-Day Summary`, ''];
      if (steps != null) lines.push(`👟 Avg Steps:       ${Math.round(steps).toLocaleString()}`);
      if (restingHR != null) lines.push(`💓 Avg Resting HR:  ${Math.round(restingHR)}bpm`);
      if (hrv != null) lines.push(`🧠 Avg HRV:         ${Math.round(hrv)}ms`);
      if (sleep != null) lines.push(`😴 Avg Sleep:       ${sleep.toFixed(1)}h`);
      if (activeCal != null) lines.push(`🔥 Avg Active Cal:  ${Math.round(activeCal).toLocaleString()} kcal`);

      if (lines.length === 2) lines.push('   No summary data available');
      console.log(lines.join('\n'));
      return;
    }

    // ── JSON output (default + --pretty) ────────────────────────────────────
    const rows = db.prepare(`
      SELECT metric, units,
             AVG(qty) as avg_qty, MIN(qty) as min_qty, MAX(qty) as max_qty,
             COUNT(*) as count,
             MIN(date) as first_date, MAX(date) as last_date
      FROM metrics
      WHERE date >= ? AND qty IS NOT NULL
      GROUP BY metric, units
      ORDER BY metric ASC
    `).all(sinceStr);
    console.log(opts.pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows));
  });
```

**Step 2: Build**

```bash
npm run build
```

Expected: zero TypeScript errors.

**Step 3: Smoke test**

```bash
npm run dev -- summary --color
npm run dev -- summary --color --days 30
npm run dev -- summary --pretty
```

**Step 4: Commit**

```bash
git add src/cli/summary.ts
git commit -m "feat: add --color flag to hvault summary"
```

---

## Task 5: Create `README.md`

**Files:**
- Create: `README.md`

**Step 1: Write the file**

```markdown
# hae-vault

[![npm version](https://img.shields.io/npm/v/hae-vault.svg)](https://www.npmjs.com/package/hae-vault)

CLI + HTTP server for Apple Health data from the [Health Auto Export](https://www.healthexportapp.com) iOS app. Ingests via REST API or ZIP file, stores in local SQLite.

```bash
npm install -g hae-vault
```

## Quick start

```bash
hvault serve                          # start ingest server (port 4242)
hvault import export.zip              # bulk import from HAE export file
hvault dashboard                      # full terminal dashboard
hvault summary --color                # N-day averages with emoji indicators
```

## Setup

1. Install the [Health Auto Export](https://www.healthexportapp.com) iOS app
2. In HAE: Settings → REST API → set server URL to `http://your-server:4242/api/ingest`
3. Or: export a ZIP from HAE and run `hvault import export.zip`

**Optional:** create `.env` in your working directory to override defaults:

```env
HVAULT_DB_PATH=~/.hae-vault/health.db   # SQLite DB location
HVAULT_PORT=4242                         # ingest server port
HVAULT_TOKEN=secret                      # bearer token for serve (optional)
HVAULT_WATCH_DIR=~/Downloads             # directory to watch for exports
```

## Commands

### Ingest

| Command | Description |
| --- | --- |
| `hvault serve` | Start HTTP server, receive HAE REST API pushes |
| `hvault import <file>` | Import HAE JSON or ZIP export (idempotent) |
| `hvault watch` | Watch directory and auto-import new HAE exports |

### Query

Output is JSON by default. Add `--pretty` for formatted JSON.

| Command | Description |
| --- | --- |
| `hvault metrics --metric <name>` | Time series for a specific metric |
| `hvault sleep` | Sleep records with stage breakdown |
| `hvault workouts` | Workout sessions |
| `hvault summary` | Per-metric averages over N days (JSON) |
| `hvault query "<sql>"` | Raw SQL query |

### Analysis

Output is pretty-printed by default. Add `--json` for raw JSON.

| Command | Description |
| --- | --- |
| `hvault summary --color` | N-day averages with emoji indicators |
| `hvault dashboard` | Full terminal dashboard with trends |
| `hvault trends` | Multi-metric trend analysis with direction arrows |

### Info

| Command | Description |
| --- | --- |
| `hvault sources` | Metric coverage in DB (name, count, date range) |
| `hvault last-sync` | Last HAE REST API push received |
| `hvault stats` | Row counts per table |

## Example output

`hvault dashboard`:
```
📅 2026-02-18 | Apple Health Vault

── Sleep (last night) ────────────────
😴 7.2h | Efficiency: 94%
   Deep: 1.5h (21%) | REM: 2.1h (29%) | Light: 3.6h (50%)
   Awake: 0.3h | Source: Apple Watch

── Activity (recent) ─────────────────
👟 8,432 steps | 🔥 420 kcal active
   Stand hours: 10

── Heart Health ──────────────────────
💓 Resting HR: 58bpm | HRV: 44ms

── Recent Workouts ───────────────────
🚶 2026-02-17  Walking            45min   280 kcal
🚴 2026-02-15  Cycling            62min   420 kcal

── 7-Day Trends ──────────────────────
   Steps:         7,200 → 8,432 ↑  (avg 7,840)
   Sleep:         6.8h → 7.2h ↑   (avg 7.1h)
   Resting HR:    60 → 58bpm ↓    (avg 59)
   HRV:           42 → 44ms ↑     (avg 43)

── Vault Stats ───────────────────────
   Metrics: 570,432 | Sleep: 365 | Workouts: 248
   Last sync: 2026-02-18 09:23 UTC
```

`hvault summary --color --days 30`:
```
📊 30-Day Summary

👟 Avg Steps:       8,432
💓 Avg Resting HR:  58bpm
🧠 Avg HRV:         44ms
😴 Avg Sleep:       7.2h
🔥 Avg Active Cal:  420 kcal
```

`hvault trends --days 7`:
```
📊 7-Day Trends

👟 Steps:      8,432 avg (6,100–11,200) ↑
💓 Resting HR: 58bpm avg (55–62) ↓
🧠 HRV:        44ms avg (38–52) ↑
😴 Sleep:      7.2h avg (5.5–8.9h) ↑
🔥 Active Cal: 420 kcal avg (280–620) →
```

`hvault stats`:
```json
{"metrics":570432,"sleep":365,"workouts":248,"syncs":12}
```

## Flags

### Ingest flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--port <n>` | serve | HTTP port (default: 4242) |
| `--token <secret>` | serve | Require `Authorization: Bearer` header |
| `--target <name>` | import, watch | Tag data with device/person name |
| `--dir <path>` | watch | Directory to watch |
| `--interval <s>` | watch | Poll interval in seconds (default: 60) |

### Query flags

| Flag | Description |
| --- | --- |
| `--days <n>` | Days of history (default varies per command) |
| `--metric <name>` | Metric name, e.g. `step_count`, `heart_rate` |
| `--pretty` | Pretty-print JSON output |

### Analysis flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--days <n>` | all analysis | Days of history (default: 7 or 90) |
| `-c, --color` | summary | Pretty terminal output |
| `--json` | dashboard, trends | Raw JSON output |

## Environment variables

Load order: CLI flag > env var > `.env` file > default.

```bash
HVAULT_DB_PATH=~/.hae-vault/health.db   # SQLite DB location
HVAULT_PORT=4242                         # serve port
HVAULT_TOKEN=secret                      # bearer token for serve
HVAULT_WATCH_DIR=~/Downloads             # directory to watch
HVAULT_WATCH_INTERVAL=60                 # watch poll interval (seconds)
HVAULT_TARGET=default                    # default target name
HVAULT_ENV_FILE=/path/to/.env            # override .env file location
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General error |

## Development

```bash
git clone https://github.com/mrkhachaturov/hae-vault.git
cd hae-vault
npm install

npm run dev -- serve         # run server without building
npm run dev -- dashboard     # run dashboard without building
npm run build                # compile TypeScript → dist/
npm test                     # run test suite
npm install -g .             # install globally as hvault
```

Node.js 22+ required.

## Full command reference

→ [docs/COMMANDS.md](docs/COMMANDS.md)

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README.md"
```

---

## Task 6: Create `docs/COMMANDS.md`

**Files:**
- Create: `docs/COMMANDS.md`

**Step 1: Write the file**

Write a detailed reference following the whoop-sync/docs/COMMANDS.md pattern. Groups: Ingest, Query, Analysis, Info. Each command gets: description, flags table, example invocation, example output.

Full content:

```markdown
# hae-vault — Full Command Reference

← [Back to README](../README.md)

---

## Ingest commands

### `serve`

Start an HTTP server that receives Health Auto Export REST API pushes.

```bash
hvault serve
hvault serve --port 4242 --token mysecret
```

| Flag | Description |
| --- | --- |
| `--port <n>` | HTTP port (default: 4242) |
| `--token <secret>` | Require `Authorization: Bearer <secret>` header |

Configure HAE: Settings → REST API → URL: `http://your-server:4242/api/ingest`

---

### `import`

Bulk import from a HAE JSON or ZIP export file. Idempotent — skips already-imported files via SHA-256 hash.

```bash
hvault import export.json
hvault import export.zip
hvault import export.zip --target me
```

| Flag | Description |
| --- | --- |
| `--target <name>` | Tag imported data with device/person name |

Output:
```json
{"metrics":1234,"sleep":7,"workouts":3,"skipped":false}
```

---

### `watch`

Poll a directory for new HAE export files and auto-import on schedule.

```bash
hvault watch
hvault watch --dir ~/Downloads
hvault watch --dir ~/Downloads --interval 60
```

| Flag | Description |
| --- | --- |
| `--dir <path>` | Directory to watch (default: `HVAULT_WATCH_DIR`) |
| `--interval <s>` | Poll interval in seconds (default: 60) |
| `--target <name>` | Tag imported data with device/person name |

---

## Query commands

All query commands output JSON by default. Add `--pretty` for formatted JSON.

### Shared flags

| Flag | Description |
| --- | --- |
| `--days <n>` | Days of history |
| `--pretty` | Pretty-print JSON output |

---

### `metrics`

Time series for a specific health metric.

```bash
hvault metrics --metric step_count --days 30
hvault metrics --metric heart_rate --days 7 --pretty
```

| Flag | Description |
| --- | --- |
| `--metric <name>` | **Required.** Metric name (e.g. `step_count`, `resting_heart_rate`) |
| `--days <n>` | Last N days (default: 30) |

Output (default JSON):
```json
[{"ts":"2026-02-18T00:00:00Z","date":"2026-02-18","qty":8432,"min":null,"avg":null,"max":null,"units":"count","source":"iPhone","target":"default"}]
```

To discover available metric names: `hvault sources`

---

### `sleep`

Sleep records with stage breakdown.

```bash
hvault sleep --days 14
hvault sleep --days 7 --pretty
```

Output:
```json
[{"date":"2026-02-17","sleep_start":"2026-02-17T22:45:00Z","sleep_end":"2026-02-18T06:00:00Z","core_h":null,"deep_h":1.5,"rem_h":2.1,"awake_h":0.3,"asleep_h":7.2,"in_bed_h":7.5,"schema_ver":"aggregated_v2","source":"Apple Watch"}]
```

---

### `workouts`

Workout sessions with duration, calories, and heart rate.

```bash
hvault workouts --days 30
hvault workouts --days 7 --pretty
```

Output:
```json
[{"ts":"2026-02-17T18:30:00Z","date":"2026-02-17","name":"Walking","duration_s":2700,"calories_kj":1172,"distance":3.2,"distance_unit":"km","avg_hr":98,"max_hr":121,"target":"default"}]
```

Note: `calories_kj` is kilojoules. Divide by 4.184 for kcal.

---

### `summary`

Per-metric averages over N days. JSON output by default.

```bash
hvault summary --days 90
hvault summary --days 30 --pretty
hvault summary --color --days 30        # pretty terminal output
```

JSON output:
```json
[{"metric":"step_count","units":"count","avg_qty":8432,"min_qty":3200,"max_qty":14100,"count":87,"first_date":"2025-11-20","last_date":"2026-02-18"}]
```

With `--color`:
```
📊 30-Day Summary

👟 Avg Steps:       8,432
💓 Avg Resting HR:  58bpm
🧠 Avg HRV:         44ms
😴 Avg Sleep:       7.2h
🔥 Avg Active Cal:  420 kcal
```

---

### `query`

Raw SQL query against the SQLite database.

```bash
hvault query "SELECT date, AVG(qty) FROM metrics WHERE metric='step_count' GROUP BY date ORDER BY date DESC LIMIT 7"
```

Returns JSON array of row objects. Use `--pretty` for formatted output.

**Tables:** `metrics`, `sleep`, `workouts`, `sync_log`, `import_log`

---

## Analysis commands

### `dashboard`

Full terminal dashboard: sleep, activity, heart health, recent workouts, N-day trends, vault stats.

```bash
hvault dashboard
hvault dashboard --days 14
hvault dashboard --json
```

| Flag | Description |
| --- | --- |
| `--days <n>` | Trend window in days (default: 7) |
| `--json` | Output raw JSON (for AI agent use) |

Output:
```
📅 2026-02-18 | Apple Health Vault

── Sleep (last night) ────────────────
😴 7.2h | Efficiency: 94%
   Deep: 1.5h (21%) | REM: 2.1h (29%) | Light: 3.6h (50%)
   Awake: 0.3h | Source: Apple Watch

── Activity (recent) ─────────────────
👟 8,432 steps | 🔥 420 kcal active
   Stand hours: 10

── Heart Health ──────────────────────
💓 Resting HR: 58bpm | HRV: 44ms

── Recent Workouts ───────────────────
🚶 2026-02-17  Walking            45min   280 kcal
🚴 2026-02-15  Cycling            62min   420 kcal

── 7-Day Trends ──────────────────────
   Steps:         7,200 → 8,432 ↑  (avg 7,840)
   Sleep:         6.8h → 7.2h ↑   (avg 7.1h)
   Resting HR:    60 → 58bpm ↓    (avg 59)
   HRV:           42 → 44ms ↑     (avg 43)

── Vault Stats ───────────────────────
   Metrics: 570,432 | Sleep: 365 | Workouts: 248
   Last sync: 2026-02-18 09:23 UTC
```

---

### `trends`

Multi-metric trend analysis with averages, ranges, and direction arrows.

```bash
hvault trends
hvault trends --days 30
hvault trends --json
```

| Flag | Description |
| --- | --- |
| `--days <n>` | Days of history (default: 7) |
| `--json` | Raw JSON output |

Output:
```
📊 7-Day Trends

👟 Steps:      8,432 avg (6,100–11,200) ↑
💓 Resting HR: 58bpm avg (55–62) ↓
🧠 HRV:        44ms avg (38–52) ↑
😴 Sleep:      7.2h avg (5.5–8.9h) ↑
🔥 Active Cal: 420 kcal avg (280–620) →
```

Direction logic: compares first-half average vs second-half average of the period.

---

## Info commands

### `sources`

Show which metrics are in the DB and their date coverage.

```bash
hvault sources
hvault sources --pretty
```

Output:
```json
[{"metric":"active_energy_burned","units":"kcal","count":365,"first_date":"2025-02-18","last_date":"2026-02-18"}]
```

---

### `last-sync`

Show when the last HAE REST API push was received.

```bash
hvault last-sync
```

Output:
```json
{"id":42,"received_at":"2026-02-18T09:23:11.000Z","target":"default","metrics_count":247,"workouts_count":0}
```

Returns `null` if no pushes have been received.

---

### `stats`

Row counts per table.

```bash
hvault stats
hvault stats --pretty
```

Output:
```json
{"metrics":570432,"sleep":365,"workouts":248,"syncs":12}
```

---

← [Back to README](../README.md)
```

**Step 2: Commit**

```bash
git add docs/COMMANDS.md
git commit -m "docs: add docs/COMMANDS.md full command reference"
```

---

## Task 7: Git init and push to GitHub

**Files:** none

**Step 1: Initialize git and set up**

> Note: The repo already has a `.git` directory. Skip `git init` if `git status` works.

```bash
cd /Volumes/storage/01_Projects/whoop/hae-vault && git status
```

If "not a git repository": run `git init && git branch -M main`

**Step 2: Check current git state**

```bash
git log --oneline -5
git status
```

**Step 3: Add remote (if not already set)**

```bash
git remote -v
```

If no remote: `git remote add origin git@github.com:mrkhachaturov/hae-vault.git`

**Step 4: Push to main**

```bash
git push -u origin main
```

Expected: branch pushed, tracking set.

---

## Final verification

```bash
# Build is clean
npm run build

# All tests pass
npm test

# CLI help works
npm run dev -- --help
npm run dev -- dashboard --help
npm run dev -- trends --help
npm run dev -- summary --help
```

Expected: zero build errors, all tests pass, help text shows new commands.
