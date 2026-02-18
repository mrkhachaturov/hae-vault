# Design: ZIP support, env config, watch command, import deduplication

**Date:** 2026-02-18
**Status:** Approved

---

## Summary

Four additions to the existing `hae-vault` codebase:

1. **ZIP support** in `hvault import` — extract `HealthAutoExport-*.json` from a `.zip`, ignore `.gpx`
2. **Env config** via `.env` + env vars — full Docker-compatible configuration
3. **`hvault watch`** — polls a directory, auto-imports new HAE exports
4. **`import_log` table + SHA-256 dedup** — skip already-imported files before parsing

---

## 1. Env Config (`src/config.ts`)

New module, loaded once at process startup via a top-level import in `src/index.ts`.

### Load order (highest priority first)

```
CLI flag  >  env var (process.env)  >  .env file  >  hardcoded default
```

Dotenv loads from:
1. `HVAULT_ENV_FILE` env var if set (explicit path to `.env`)
2. `./.env` in CWD (local dev convenience)

In Docker: set env vars directly — no `.env` file needed.

### Variables

| Env var               | Default                      | Used by              |
|-----------------------|------------------------------|----------------------|
| `HVAULT_ENV_FILE`     | —                            | config bootstrap     |
| `HVAULT_DB_PATH`      | `~/.hae-vault/health.db`     | all commands         |
| `HVAULT_PORT`         | `4242`                       | `serve`              |
| `HVAULT_TOKEN`        | —                            | `serve`              |
| `HVAULT_WATCH_DIR`    | —                            | `watch`              |
| `HVAULT_WATCH_INTERVAL` | `60`                       | `watch`              |
| `HVAULT_TARGET`       | `default`                    | `import`, `watch`    |

### Tilde expansion

`HVAULT_DB_PATH=~/.hae-vault/health.db` — dotenv reads `~` as a literal character. `config.ts` replaces a leading `~/` with `os.homedir() + '/'`.

### config object

```typescript
export const config = {
  dbPath:        string,   // resolved absolute path
  port:          number,
  token:         string | undefined,
  watchDir:      string | undefined,
  watchInterval: number,   // seconds
  target:        string,
}
```

### CLI flag override pattern

Each command reads its default from `config`, CLI flags override:

```typescript
// serve.ts
.option('-p, --port <number>', 'Port', String(config.port))
.option('--token <secret>', 'Bearer token', config.token)
```

---

## 2. ZIP support in `hvault import`

Library: **`adm-zip`** — pure JS, synchronous, no native bindings. Matches existing sync codebase.

### Logic in `src/cli/import.ts`

```
if file.endsWith('.zip'):
  open zip
  find entry matching /HealthAutoExport.*\.json$/i
  if not found → error "No HealthAutoExport-*.json found in zip"
  read entry buffer → parse as JSON
else:
  readFileSync(file) → parse as JSON
```

GPX files are ignored entirely — no extraction, no error.

### Hash computation

SHA-256 of the **raw file bytes** (the `.zip` or `.json` file itself, before extraction). Computed with `node:crypto` — no extra dependency.

---

## 3. `import_log` table (deduplication)

### Schema addition to `src/db/schema.ts`

```sql
CREATE TABLE IF NOT EXISTS import_log (
  id            INTEGER PRIMARY KEY,
  filename      TEXT NOT NULL,
  file_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 hex of file content
  imported_at   TEXT NOT NULL,          -- ISO8601
  metrics_added INTEGER,
  sleep_added   INTEGER,
  workouts_added INTEGER
);
```

### Dedup flow (in `src/cli/import.ts`)

```
1. hash = sha256(fileBuffer)
2. existing = db.prepare('SELECT id FROM import_log WHERE file_hash = ?').get(hash)
3. if existing → print { skipped: true, reason: 'already imported', hash } → exit 0
4. ingest(payload)
5. INSERT INTO import_log (filename, file_hash, imported_at, metrics_added, sleep_added, workouts_added)
```

### `ingest()` return type change

`ingest()` currently returns `void`. Change to return `IngestResult`:

```typescript
export interface IngestResult {
  metricsAdded: number;
  sleepAdded: number;
  workoutsAdded: number;
}
```

This is a breaking change to the function signature — existing `ingest.test.ts` will need updating (callers that ignore the return value are fine; tests asserting `void` need a minor fix).

---

## 4. `hvault watch` command (`src/cli/watch.ts`)

Polls a directory on an interval, picks up new HAE export files, imports them.

### File matching pattern

`HealthAutoExport-*.{zip,json}` — case-insensitive regex: `/^HealthAutoExport.*\.(zip|json)$/i`

### Flow

```
startup:
  resolve watchDir (--dir flag ?? HVAULT_WATCH_DIR ?? error)
  open DB
  log "Watching <dir> every <N>s"

each tick:
  list files in dir matching pattern
  for each file:
    hash = sha256(readFileSync(file))
    if import_log has this hash → skip
    import(file) → log result
    sleep N seconds → repeat
```

### Options

```bash
hvault watch [--dir <path>] [--interval <seconds>] [--target <name>]
```

Defaults from `config.watchDir`, `config.watchInterval`, `config.target`.

`--dir` is required if `HVAULT_WATCH_DIR` is not set — error and exit if neither provided.

### Output

Each tick logs to stdout as JSON lines:

```json
{ "tick": "2026-02-18T10:00:00Z", "dir": "/Downloads", "found": 3, "imported": 1, "skipped": 2 }
```

On import, also logs the import result (same format as `hvault import`).

---

## 5. Files changed / created

| File | Change |
|------|--------|
| `package.json` | add `adm-zip` dependency |
| `src/config.ts` | NEW — dotenv load + config singleton |
| `src/index.ts` | add `import './config.js'` at top |
| `src/db/schema.ts` | add `import_log` table |
| `src/server/ingest.ts` | return `IngestResult` instead of `void` |
| `src/cli/import.ts` | ZIP support + hash dedup + `import_log` write |
| `src/cli/serve.ts` | read port/token defaults from `config` |
| `src/cli/watch.ts` | NEW |
| `src/cli/index.ts` | register `watchCommand` |
| `tests/ingest.test.ts` | update for `IngestResult` return type |
| `tests/import-zip.test.ts` | NEW — test ZIP extraction + dedup |
| `tests/watch.test.ts` | NEW — test watch polling logic |

---

## Out of scope

- File deletion after import (watch leaves files in place)
- Recursive directory scanning (flat dir only)
- `.env` file creation tooling
- Docker Compose / Dockerfile (not part of this package)
