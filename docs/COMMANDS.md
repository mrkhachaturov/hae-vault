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

### API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/ingest` | Receive HAE payload (JSON body) |
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |

**`POST /api/ingest`**

Request body: HAE JSON payload (`Content-Type: application/json`, max 50mb)

```json
{ "data": { "metrics": [], "workouts": [], ... } }
```

Query parameter:
- `?target=<name>` — tag ingested data with a device/person label (default: `default`)

Request headers (optional):
- `Authorization: Bearer <token>` or `X-Api-Key: <token>` — required if `--token` is set
- `Session-Id: <id>` — links records to a sync session
- `Automation-Name: <name>` — HAE automation name (logged to sync_log)
- `Automation-Period: <period>` — HAE automation period (logged to sync_log)

Response on success: `{"ok":true}`
Response on error: `{"error":"<message>"}` with status 400 or 401

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
hvault summary --color --days 30
```

| Flag | Description |
| --- | --- |
| `--days <n>` | Last N days (default: 90) |
| `--pretty` | Pretty-print JSON |
| `-c, --color` | Pretty terminal output with emoji indicators |

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
