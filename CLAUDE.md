# hae-vault — Claude Code Guide

## Project Identity

- **npm package name:** `hae-vault`
- **CLI command:** `hvault`
- **Install:** `npm install -g hae-vault`
- **Language:** TypeScript (Node.js 22+, ESM, NodeNext)
- **Status:** Implemented and working — 570k+ rows ingested from real Apple Health data

---

## What This Project Does

`hae-vault` is an npm package with three responsibilities:

1. **Server** (`hvault serve`): HTTP server that receives health data pushed from the **Health Auto Export** iOS app. POST to `/api/ingest`, writes to local SQLite.

2. **Import** (`hvault import <file>`): Bulk import from a HAE JSON or ZIP export file. Idempotent via SHA-256 hash tracking — skips already-imported files.

3. **Watch** (`hvault watch`): Polls a directory for new HAE export files, auto-imports on schedule. Configurable via env vars.

4. **CLI** (`hvault <command>`): Query interface for AI agents (OpenClaw). Returns JSON.

---

## Ecosystem Context

```
OpenClaw (AI agent platform, remote server)
├── skill: whoop-up       ← existing, WHOOP wearable, live API calls
├── skill: hae-vault      ← Apple Health archive, queries SQLite
│
├── whoop-up CLI          ← npm install -g whoop-up (already published)
└── hvault CLI            ← npm install -g hae-vault (local install)
     └── reads ~/.hae-vault/health.db (SQLite)

iPhone (Health Auto Export app)
  └── REST API automation → POST http://server:4242/api/ingest
        └── writes to health.db via hvault serve

OR

HAE Manual Export → .zip file → hvault import export.zip
```

---

## Source Structure

```
hae-vault/
├── src/
│   ├── index.ts             ← entry point, Commander CLI
│   ├── config.ts            ← env config singleton (dotenv + HVAULT_* vars)
│   ├── server/
│   │   ├── app.ts           ← Express HTTP server
│   │   └── ingest.ts        ← parse payload → write to DB, returns IngestResult
│   ├── db/
│   │   ├── schema.ts        ← SQLite schema + openDb() + closeDb()
│   │   ├── metrics.ts       ← upsertMetrics()
│   │   ├── sleep.ts         ← upsertSleep()
│   │   ├── workouts.ts      ← upsertWorkout()
│   │   └── importLog.ts     ← hasBeenImported() + logImport() (SHA-256 dedup)
│   ├── parse/
│   │   ├── time.ts          ← 5-format date parser
│   │   ├── metrics.ts       ← MetricData[] → NormalizedMetric[]
│   │   ├── sleep.ts         ← detect 3 variants, normalizeSleep()
│   │   └── workouts.ts      ← WorkoutData[] → NormalizedWorkout
│   ├── util/
│   │   └── zip.ts           ← extractPayloadFromZip() — adm-zip, finds HealthAutoExport-*.json
│   ├── cli/
│   │   ├── index.ts         ← program + all command registrations
│   │   ├── serve.ts         ← hvault serve
│   │   ├── import.ts        ← hvault import <file> (JSON or ZIP, dedup via import_log)
│   │   ├── watch.ts         ← hvault watch (polls dir, auto-imports, exports tick())
│   │   ├── metrics.ts       ← hvault metrics --metric <name> --days N
│   │   ├── sleep.ts         ← hvault sleep --days N
│   │   ├── workouts.ts      ← hvault workouts --days N
│   │   ├── summary.ts       ← hvault summary --days N
│   │   ├── query.ts         ← hvault query "<sql>"
│   │   └── info.ts          ← hvault sources | last-sync | stats
│   └── types/
│       └── hae.ts           ← TypeScript interfaces for HAE payload
├── tests/
│   ├── types.test.ts
│   ├── parse-time.test.ts
│   ├── parse-sleep.test.ts
│   ├── parse-metrics.test.ts
│   ├── parse-workouts.test.ts
│   ├── db-schema.test.ts
│   ├── db-metrics.test.ts
│   ├── db-sleep.test.ts
│   ├── db-workouts.test.ts
│   ├── db-import-log.test.ts
│   ├── ingest.test.ts
│   ├── util-zip.test.ts
│   └── cli-watch.test.ts
├── docs/plans/              ← design + implementation plan docs
├── CLAUDE.md
├── SKILL.md                 ← OpenClaw skill definition
├── package.json             ← bin: { "hvault": "dist/index.js" }
└── tsconfig.json
```

---

## CLI Commands

```bash
# Server
hvault serve                          # start HTTP ingest server (default port 4242)
hvault serve --port 4242              # custom port
hvault serve --token <secret>         # require Authorization: Bearer <secret>

# Import from file (JSON or ZIP)
hvault import export.json             # import HAE JSON export
hvault import export.zip              # import HAE zip (extracts HealthAutoExport-*.json)
hvault import export.zip --target me  # tag with device/person name

# Watch directory for new exports
hvault watch                          # uses HVAULT_WATCH_DIR env var
hvault watch --dir ~/Downloads        # watch specific directory
hvault watch --interval 60            # check every 60 seconds

# Query (all return JSON, --pretty for formatted)
hvault metrics --metric step_count --days 30
hvault metrics --metric heart_rate --days 7
hvault sleep --days 14
hvault workouts --days 30
hvault summary --days 90
hvault query "<sql>"                  # raw SQL → JSON
hvault sources                        # metric coverage in DB
hvault last-sync                      # last REST API push received
hvault stats                          # row counts per table
```

---

## Environment Variables

Load order: CLI flag > env var > `.env` file > hardcoded default.

In Docker: set env vars directly — no `.env` file needed.

```bash
HVAULT_ENV_FILE=/path/to/.env            # override .env file location (default: CWD/.env)
HVAULT_DB_PATH=~/.hae-vault/health.db   # SQLite DB location (tilde expanded)
HVAULT_PORT=4242                         # serve port
HVAULT_TOKEN=secret                      # bearer token for serve
HVAULT_WATCH_DIR=~/Downloads             # directory to watch for exports (tilde expanded)
HVAULT_WATCH_INTERVAL=60                 # watch poll interval (seconds)
HVAULT_TARGET=default                    # default target name
```

---

## SQLite Schema

Database: `~/.hae-vault/health.db`

### Tables
- `metrics` — all health metrics (steps, HR, HRV, etc.)  `UNIQUE(ts, metric, source, target)`
- `sleep` — nightly sleep records (3 schema variants handled)  `UNIQUE(date, source, target)`
- `workouts` — workout sessions  `UNIQUE(ts, name, target)`
- `sync_log` — REST API push history
- `import_log` — file import history with SHA-256 hash for deduplication  `UNIQUE(file_hash)`

### Key implementation notes
- **WAL mode** — concurrent reads while server writes
- **`INSERT OR REPLACE`** — idempotent upserts throughout
- **`import_log` hash check** — skip re-importing identical files
- **DB path** from `HVAULT_DB_PATH` env or `~/.hae-vault/health.db`

---

## Payload Format (HAE REST API)

Top-level:
```json
{ "data": { "metrics": [], "workouts": [], "stateOfMind": [], ... } }
```

### Date format — 5 variants (all handled by `src/parse/time.ts`)
```
"2026-01-15 14:30:00 +0000"          ← 24-hour
"2026-01-15 2:30:00 PM +0000"        ← 12-hour uppercase
"2026-01-15 2:30:00 pm +0000"        ← 12-hour lowercase
"2026-01-15 2:30:00\u202fPM +0000"   ← narrow non-breaking space before PM
"2026-01-15 2:30:00\u202fpm +0000"   ← narrow non-breaking space before pm
```

### Sleep — 3 schema variants (detected by `src/parse/sleep.ts`)
- `detailed` — has `startDate`/`endDate` (non-aggregated phases)
- `aggregated_v2` — has `core`/`deep`/`rem` + `source` (HAE >= 6.6.2)
- `aggregated_v1` — has `sleepSource`/`inBedSource` (HAE < 6.6.2)

Detection: `'startDate' in dp` → detailed | `'core' in dp` → v2 | else → v1

---

## Development

```bash
npm install
npm run dev -- serve             # run server without building
npm run build                    # compile TypeScript → dist/
npm test                         # run all tests (59 passing)
npm install -g .                 # install globally as hvault
```

---

## Reference Projects

Located at `/Volumes/storage/01_Projects/whoop/healthy/`:

- `health-auto-export-server/` — TypeScript/MongoDB reference. Useful: `MetricName.ts`, `Metric.ts`
- `apple-health-ingester/` — Go reference. Useful: `types.go` (canonical type defs + time parser)
- `restapi.md` — Official HAE REST API documentation
