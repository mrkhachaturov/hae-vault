---
name: hvault
description: >
  Apple Health database — aggregates data from all sources (Apple Watch, iPhone,
  WHOOP app, third-party apps, manual entries) via Health Auto Export app.
  PRIMARY use: steps, walking distance, stand hours, active calories, VO2max,
  workouts, body weight, blood oxygen spot checks, nutrition (dietary calories,
  protein, carbs, fat, fiber, sugar) — anything logged to Apple Health.
  SECONDARY (prefer whoop skill when available): HRV, resting heart rate, sleep duration.
  Do NOT use for recovery score, strain, or sleep stages — use the whoop skill for those.
---

# hae-vault

Query Apple Health data from a local SQLite database populated by the Health Auto Export iOS app.
Apple Health is an aggregator — it collects data from Apple Watch, iPhone, WHOOP (when connected), and any other app writing to HealthKit.

## Device context

- **Apple Health** — the aggregator; hae-vault is a local mirror of its full database
- **WHOOP** — worn 24/7 including sleep → writes sleep duration + some metrics to Apple Health when connected; authoritative source (via `whoop` skill) for: recovery, sleep stages, HRV, RHR, strain, SpO2, skin temp, respiratory rate
- **Apple Watch** — worn morning to night → primary contributor for: steps, stand hours, active calories, workouts, VO2max, daytime heart rate
- **iPhone** — passive background tracking → supplements steps and distance

**Prefer `whoop` skill** for: recovery, sleep quality, HRV, RHR, strain — richer data and more accurate (continuous overnight measurement).
**Use `hvault`** for: steps, walking distance, stand hours, workouts, VO2max, body metrics, and any Apple Health metric not in WHOOP.

**Note:** WHOOP API does not expose step count or walking distance. For "how many steps / how far did I walk" → use hvault. For "how active / how hard did I work" → use whoop strain.

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

# Nutrition
hvault nutrition --days 30         # daily macros + calories (JSON); --entries for raw rows
hvault ndash --days 7              # nutrition dashboard: macros, split, trends

# Body composition
hvault body --days 90              # weight, BMI, body fat, lean mass (JSON)
hvault bdash --days 30             # body dashboard: weight, body fat trends

# Vitals
hvault vitals --days 30            # resting HR, HRV, SpO2, VO2max, BP (JSON)
hvault vdash --days 7              # vitals dashboard: heart, oxygen, recovery

# Mobility / gait
hvault mobility --days 30          # walking speed, step length, gait metrics (JSON)
hvault mdash --days 14             # mobility dashboard: gait trends

# Wellness
hvault mindfulness --days 30       # mindful minutes, daylight, handwashing (JSON)
hvault wdash --days 14             # wellness dashboard: mindfulness, daylight

# Custom
hvault query "<sql>"               # raw SQL, returns JSON array

# DB info
hvault sources                     # available metrics + date ranges
hvault stats                       # row counts per table
hvault last-sync                   # last HAE push timestamp
```

## Key metric names

Non-obvious names to use with `hvault metrics --metric <name>`:

**Activity**
| What you want | Metric name | Units |
|---|---|---|
| Steps | `step_count` | count |
| Walking + running distance | `walking_running_distance` | km |
| Active calories burned | `active_energy` | kJ |
| Basal calories burned | `basal_energy_burned` | kJ |
| Exercise time | `apple_exercise_time` | min |
| Stand hours | `apple_stand_hour` | count |
| Stand time | `apple_stand_time` | min |
| Flights climbed | `flights_climbed` | count |
| Physical effort | `physical_effort` | kcal/hr·kg |
| Time in daylight | `time_in_daylight` | min |

**Heart & Vitals**
| What you want | Metric name | Units |
|---|---|---|
| Heart rate | `heart_rate` | count/min |
| Resting HR | `resting_heart_rate` | count/min |
| HRV | `heart_rate_variability` | ms |
| Walking HR avg | `walking_heart_rate_average` | count/min |
| Blood oxygen (SpO2) | `blood_oxygen_saturation` | % |
| Respiratory rate | `respiratory_rate` | count/min |
| Cardio recovery | `cardio_recovery` | count/min |
| Blood pressure | `blood_pressure` | mmHg |

**Walking mechanics**
| What you want | Metric name | Units |
|---|---|---|
| Walking speed | `walking_speed` | km/hr |
| Step length | `walking_step_length` | cm |
| Walking asymmetry | `walking_asymmetry_percentage` | % |
| Double support % | `walking_double_support_percentage` | % |
| Stair speed up | `stair_speed_up` | m/s |
| Stair speed down | `stair_speed_down` | m/s |
| 6-min walk distance | `six_minute_walking_test_distance` | m |

**Body metrics**
| What you want | Metric name | Units |
|---|---|---|
| Body weight | `weight_body_mass` | kg |
| Body fat % | `body_fat_percentage` | % |
| BMI | `body_mass_index` | count |
| VO2max | `vo2_max` | ml/(kg·min) |

**Nutrition (logged via food tracking app)**
| What you want | Metric name | Units |
|---|---|---|
| Dietary calories (food eaten) | `dietary_energy` | kJ |
| Protein | `protein` | g |
| Carbohydrates | `carbohydrates` | g |
| Total fat | `total_fat` | g |
| Fiber | `fiber` | g |
| Sugar | `dietary_sugar` | g |
| Sodium | `sodium` | mg |
| Cholesterol | `cholesterol` | mg |

**Other**
| What you want | Metric name | Units |
|---|---|---|
| Mindfulness minutes | `mindful_minutes` | min |
| Wrist temperature | `apple_sleeping_wrist_temperature` | degC |
| Environmental noise | `environmental_audio_exposure` | dBASPL |
| Headphone volume | `headphone_audio_exposure` | dBASPL |

Use `hvault sources` to see everything in the DB with date ranges.

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

- `--json` on analysis/dashboard commands (`dashboard`, `trends`, `ndash`, `bdash`, `vdash`, `mdash`, `wdash`) → machine-readable JSON
- `--pretty` on query commands (`metrics`, `sleep`, `workouts`, `summary`, `nutrition`, `body`, `vitals`, `mobility`, `mindfulness`) → formatted JSON
- `--entries` on `nutrition` → individual log entries instead of daily totals
- `--color` on `summary` → emoji terminal output (use for user-facing replies)
- `--days <n>` on most commands to change the time window
