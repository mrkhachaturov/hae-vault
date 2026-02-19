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
   - Endpoint: `POST /api/ingest` (JSON body, max 50mb)
   - Health check: `GET /health` → `{"status":"ok"}`
   - Optional: append `?target=me` to tag data by device/person
3. Or: export a ZIP from HAE and run `hvault import export.zip`

**Optional:** create `.env` in your working directory to override defaults:

```env
HVAULT_DB_PATH=~/.hae-vault/health.db   # SQLite DB location
HVAULT_PORT=4242                         # ingest server port
HVAULT_TOKEN=secret                      # bearer token for serve (optional)
HVAULT_AUTH=secret                       # alias for HVAULT_TOKEN (use if _TOKEN is blocked)
HVAULT_WATCH_DIR=~/Downloads             # directory to watch for exports
HVAULT_WATCH_INTERVAL=60                 # watch poll interval in seconds (default: 60)
```

## Commands

### Ingest

| Command | Description |
| --- | --- |
| `hvault start` | Start server + watcher based on env vars (recommended for Docker/daemons) |
| `hvault serve` | Start HTTP server only |
| `hvault import <file>` | Import HAE JSON or ZIP export (idempotent) |
| `hvault watch` | Watch directory and auto-import new HAE exports |

> **`watch` file matching:** only files matching `/^HealthAutoExport.*\.(zip|json)$/i` are picked up.
> The Health Auto Export app names files this way by default (e.g. `HealthAutoExport-2020-2025.zip`).
> Files with any other name are silently ignored.

### Query

Output is JSON by default. Add `--pretty` for formatted JSON.

| Command | Description |
| --- | --- |
| `hvault metrics --metric <name>` | Time series for a specific metric |
| `hvault sleep` | Sleep records with stage breakdown |
| `hvault workouts` | Workout sessions |
| `hvault summary` | Per-metric averages over N days (JSON) |
| `hvault nutrition` | Daily macros + calories (JSON); `--entries` for raw rows |
| `hvault body` | Body composition: weight, BMI, body fat, lean mass (JSON) |
| `hvault vitals` | Vitals: resting HR, HRV, SpO2, VO2max, blood pressure (JSON) |
| `hvault mobility` | Gait metrics: walking speed, step length, stair speed (JSON) |
| `hvault mindfulness` | Mindful minutes, daylight, handwashing count (JSON) |
| `hvault query "<sql>"` | Raw SQL query |

### Analysis

Output is pretty-printed by default. Add `--json` for raw JSON.

| Command | Description |
| --- | --- |
| `hvault summary --color` | N-day averages with emoji indicators |
| `hvault dashboard` | Full terminal dashboard with trends |
| `hvault trends` | Multi-metric trend analysis with direction arrows |
| `hvault ndash` | Nutrition dashboard: macros, calorie split, trends |
| `hvault bdash` | Body composition dashboard: weight, body fat trends |
| `hvault vdash` | Vitals dashboard: HR, HRV, SpO2, recovery |
| `hvault mdash` | Mobility dashboard: gait trends with direction indicators |
| `hvault wdash` | Wellness dashboard: mindfulness, daylight, handwashing |

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

`hvault ndash --days 180`:
```
📅 2026-02-19 | 🍽️  Nutrition Dashboard

── Today's Macros ────────────────────────────
🍽️  711 kcal  (latest: 2025-10-06)
   🥩 Protein: 70g  |  🍞 Carbs: 43g  |  🫒 Fat: 30g
   🌿 Fiber: 7g  |  🍬 Sugar: 2g  |  🧂 Sodium: 71mg  |  💊 Cholesterol: 0mg

── Macro Split (% of calories) ───────────────
   🥩 Protein  ████████░░░░░░░░░░░░  38%   70g
   🍞 Carbs    █████░░░░░░░░░░░░░░░  24%   43g
   🫒 Fat      ████████░░░░░░░░░░░░  38%   30g

── 180-Day Trends ────────────────────────────
   Calories:      1,649 → 711 kcal ↓  (avg 1,820)
   Protein:       147 → 70g ↓  (avg 141)
   Carbs:         96 → 43g ↓  (avg 152)
   Fat:           76 → 30g ↓  (avg 70)
```

`hvault vdash --days 60`:
```
📅 2026-02-19 | 💓 Vitals Dashboard

── Current ───────────────────────────────────
💓 Resting HR: 56bpm  |  HRV: —  |  🩺 SpO2: 92.7%  (latest: 2025-12-30)
   🫁 Resp: 15.8/min

── 60-Day Trends ─────────────────────────────
   Resting HR:        58 → 56bpm ↓  (avg 60)
   SpO2:              95.5 → 92.7% ↓  (avg 94.8)
   Resp. rate:        15.3 → 15.8/min ↑  (avg 15.8)
```

`hvault mdash --days 60`:
```
📅 2026-02-19 | 🚶 Mobility Dashboard

── Current ───────────────────────────────────
🚶 Speed: 4.7 km/h  |  📐 Step: 71cm  |  ⚖️  Asym: 0.0%  (latest: 2025-12-30)
   Double support: 33.5%

── 60-Day Trends ─────────────────────────────
   Walking speed:       4.5 → 4.7 km/h ↑  (avg 4.3)
   Step length:         71.1 → 71.3cm →  (avg 67.8)
   Asymmetry:           2.0 → 0.0% ↓ (better)  (avg 2.3)
   Double support:      32.3 → 33.5% ↑ (worse)  (avg 33.4)
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
| `--metric <name>` | Metric name, e.g. `step_count`, `resting_heart_rate` |
| `--pretty` | Pretty-print JSON output |

### Analysis flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--days <n>` | all analysis | Days of history (default: 7 or 90) |
| `-c, --color` | summary | Pretty terminal output |
| `--json` | dashboard, trends, ndash, bdash, vdash, mdash, wdash | Raw JSON output |
| `--entries` | nutrition | Show individual log entries instead of daily totals |

## Environment variables

Load order: CLI flag > env var > `.env` file > default.

```bash
HVAULT_DB_PATH=~/.hae-vault/health.db   # SQLite DB location
HVAULT_PORT=4242                         # serve port
HVAULT_TOKEN=secret                      # bearer token for serve
HVAULT_AUTH=secret                       # alias for HVAULT_TOKEN (use if _TOKEN is blocked by your env)
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
