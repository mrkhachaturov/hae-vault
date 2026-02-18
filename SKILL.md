---
name: hae-vault
description: >
  Apple Health data from iPhone/Apple Watch via Health Auto Export app.
  PRIMARY use: steps, walking distance, stand hours, active calories, VO2max,
  workouts logged to Apple Health, body weight, blood oxygen spot checks.
  SECONDARY (prefer whoop skill when available): HRV, resting heart rate, sleep.
  Use when asked about daily activity, step counts, Apple Watch workouts, or
  metrics not covered by WHOOP. Do NOT use for recovery score, strain, or sleep
  stages — use the whoop skill for those.
---

# hae-vault

Query Apple Health data from a local SQLite database populated by the Health Auto Export iOS app.

## Device context

- **WHOOP** — worn 24/7 including sleep → authoritative for: recovery, sleep (total duration), HRV (continuous overnight), RHR (during sleep), strain, SpO2, skin temp, respiratory rate
- **Apple Watch** — worn morning to night (not during sleep) → authoritative for: steps, walking distance, stand hours, active calories, Apple Health workouts, VO2max, daytime heart rate
- **iPhone** — passive background tracking → supplements steps and distance when watch is off

**Prefer `whoop` skill** for: recovery, sleep quality, HRV, RHR, strain — WHOOP measures these more accurately (continuous, during sleep).
**Prefer `hae-vault`** for: steps, activity rings, workouts, VO2max, body metrics, anything Apple Watch/iPhone specific.

## Workflow

**Start broad, then drill down:**

1. `hvault dashboard --json` — full snapshot (sleep, activity, heart health, workouts, trends)
2. Drill into specifics with `hvault metrics`, `hvault sleep`, `hvault workouts`, or `hvault summary`
3. Use `hvault query "<sql>"` for custom analysis

**Always check data availability first** when a metric might not exist:
```bash
hvault sources   # see what's in the DB with date ranges
hvault last-sync # when data was last received from HAE
```

## Commands

```bash
# Broad overview
hvault dashboard --json            # full snapshot (use --json for AI)
hvault summary --days 30           # per-metric averages (JSON)
hvault trends --json               # trend directions with ranges

# Specific data
hvault sleep --days 14             # sleep stages (deep, REM, core, awake)
hvault workouts --days 30          # workouts with duration, calories, HR
hvault metrics --metric <name> --days 30   # time series for one metric

# Custom
hvault query "<sql>"               # raw SQL, returns JSON array

# DB info
hvault sources                     # available metrics + date ranges
hvault stats                       # row counts per table
hvault last-sync                   # last HAE push timestamp
```

## Key metric names

Non-obvious names to use with `hvault metrics --metric <name>`:

| What you want | Metric name |
|---|---|
| Steps | `step_count` |
| Heart rate | `heart_rate` |
| HRV | `heart_rate_variability` |
| Resting HR | `resting_heart_rate` |
| Active calories | `active_energy_burned` |
| Basal calories | `basal_energy_burned` |
| Blood oxygen | `blood_oxygen_saturation` |
| Respiratory rate | `respiratory_rate` |
| VO2max | `vo2max` |
| Body weight | `weight_body_mass` |
| Body fat | `body_fat_percentage` |
| Mindfulness | `mindful_minutes` |
| Distance | `walking_running_distance` |
| Flights climbed | `flights_climbed` |

Use `hvault sources` to see what's actually in the DB.

## SQL tables (for `hvault query`)

```
metrics      — ts, date, metric, qty, min, avg, max, units, source, target
sleep        — date, sleep_start, sleep_end, core_h, deep_h, rem_h, awake_h, asleep_h, in_bed_h, source
workouts     — ts, date, name, duration_s, calories_kj, distance, distance_unit, avg_hr, max_hr, target
sync_log     — id, received_at, target, metrics_count, workouts_count
import_log   — id, file_hash, imported_at, metrics, sleep, workouts
```

**Gotcha:** `calories_kj` in workouts is **kilojoules** — divide by 4.184 for kcal.

## Sleep stages note

User wears **WHOOP only** during sleep (no Apple Watch at night). WHOOP writes total sleep time to Apple Health but **does not export sleep stages** (deep/REM/core). Expect `deep_h`, `rem_h`, `core_h` = 0 for all recent sleep entries — this is correct, not missing data. For sleep stage breakdown, use the `whoop` skill instead.

## Output flags

- `--json` on analysis commands (`dashboard`, `trends`) → machine-readable JSON
- `--pretty` on query commands (`metrics`, `sleep`, `workouts`, `summary`) → formatted JSON
- `--color` on `summary` → emoji terminal output (use for user-facing replies)
- `--days <n>` on most commands to change the time window
