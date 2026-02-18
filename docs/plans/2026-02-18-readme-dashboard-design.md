# hae-vault — README, Dashboard & CLI Polish Design

**Date:** 2026-02-18
**Status:** Approved

---

## Scope

Five deliverables:

1. **package.json** — add `repository`, `homepage`, `bugs`, `keywords`; match whoop-up metadata style
2. **Git setup** — init, first commit, set remote `git@github.com:mrkhachaturov/hae-vault.git`, push to main
3. **README.md + docs/COMMANDS.md** — full documentation following whoop-up style with example terminal outputs
4. **CLI additions** — `hvault dashboard` (new) + `hvault summary --color` (enhancement) + `hvault trends` (new)

---

## package.json Changes

Add these fields to match whoop-up:

```json
"keywords": ["apple-health", "health-auto-export", "sqlite", "cli", "hvault", "sleep", "hrv", "steps", "fitness"],
"repository": { "type": "git", "url": "https://github.com/mrkhachaturov/hae-vault.git" },
"homepage": "https://github.com/mrkhachaturov/hae-vault#readme",
"bugs": { "url": "https://github.com/mrkhachaturov/hae-vault/issues" }
```

Author already correct: `"Ruben Khachaturov <mr.kha4a2rov@protonmail.com>"`

---

## README.md Structure

Mirrors whoop-sync/README.md style:

1. Title + npm badge
2. One-liner description
3. Quick start (install + 4 key commands)
4. Setup (HAE app config, env vars, serve/import/watch)
5. Commands table — grouped: Ingest, Query, Analysis
6. Example outputs — `hvault dashboard`, `hvault summary --color`, `hvault stats`
7. Environment variables table
8. Token/auth note (none — no OAuth, just local SQLite)
9. Exit codes
10. Development section
11. Link to `docs/COMMANDS.md`

---

## docs/COMMANDS.md Structure

Full reference following whoop-sync/docs/COMMANDS.md:
- Each command with flags, description, example output
- Groups: Ingest (serve/import/watch), Query (metrics/sleep/workouts/query), Analysis (summary/dashboard), Info (sources/last-sync/stats)

---

## New CLI: `hvault dashboard`

**File:** `src/cli/dashboard.ts`

Sections:

### Sleep (last night)
Query: `SELECT * FROM sleep ORDER BY date DESC LIMIT 1`
Fields: `asleep_h`, `deep_h`, `rem_h`, `awake_h`, `in_bed_h`, `source`
Derived: efficiency = asleep_h / in_bed_h * 100, stage percentages

### Activity (today)
Query: `SELECT qty FROM metrics WHERE metric IN ('step_count','active_energy_burned','apple_stand_hour') AND date = today ORDER BY ts DESC LIMIT 1 each`
Graceful: show `—` if metric not in DB

### Heart Health
Query: `SELECT qty FROM metrics WHERE metric IN ('resting_heart_rate','heart_rate_variability_sdnn') AND date = today ORDER BY ts DESC LIMIT 1 each`
Fallback: search last 7 days if today has no data

### Recent Workouts
Query: `SELECT date, name, duration_min, calories FROM workouts ORDER BY ts DESC LIMIT 5`
Show sport emoji based on name (walk→🚶, run→🏃, cycling→🚴, etc.)

### 7-Day Trends
Per metric: fetch 7 daily aggregates (avg per day), compute first→last delta, direction arrow ↑↓→
Metrics: step_count, resting_heart_rate, heart_rate_variability_sdnn + sleep.asleep_h

### Vault Stats
Row counts: metrics, sleep, workouts tables
Last sync: `SELECT received_at FROM sync_log ORDER BY received_at DESC LIMIT 1`

**Output format:**
```
📅 2026-02-18 | Apple Health Vault

── Sleep (last night) ────────────────
😴 7.2h | Efficiency: 94%
   Deep: 1.5h (21%) | REM: 2.1h (29%) | Light: 3.6h (50%)
   Awake: 0.3h | Source: Apple Watch

── Activity (today) ──────────────────
👟 8,432 steps | 🔥 420 kcal active
   Stand hours: 10

── Heart Health ──────────────────────
💓 Resting HR: 58bpm | HRV: 44ms

── Recent Workouts ───────────────────
🏃 2026-02-17  Walking        45min   280 kcal
🚴 2026-02-15  Cycling        62min   420 kcal

── 7-Day Trends ──────────────────────
   Steps:      7,200 → 8,432 ↑  (avg 7,840)
   Sleep:      6.8h → 7.2h ↑   (avg 7.1h)
   Resting HR: 60 → 58bpm ↓
   HRV:        42 → 44ms ↑

── Vault Stats ───────────────────────
   Metrics: 570,432 | Sleep: 365 | Workouts: 248
   Last sync: 2026-02-18 09:23 UTC
```

**Flags:**
- `--json` — output raw JSON (for AI agent use)
- `--days <n>` — trend window (default: 7)

---

## Enhanced `hvault summary --color`

**File:** `src/cli/summary.ts` (modify existing)

Current behavior: JSON output of all metric averages.
New behavior with `--color`: pretty terminal output of key metric averages.

Key metrics to highlight (skip if not in DB):
- `step_count` → 👟
- `resting_heart_rate` → 💓
- `heart_rate_variability_sdnn` → 🧠
- `active_energy_burned` → 🔥
- Sleep hours (from `sleep` table) → 😴

**Output:**
```
📊 30-Day Summary

👟 Avg Steps:       8,432
💓 Avg Resting HR:  58bpm
🧠 Avg HRV:         44ms
😴 Avg Sleep:       7.2h
🔥 Avg Active Cal:  420 kcal
```

New flags added to `summary`:
- `-c, --color` — pretty terminal output with emoji headers
- `--json` — explicit JSON mode (existing `--pretty` remains for compat)

---

## CLI Registration

`src/cli/index.ts`: add `import { dashboardCommand }` + `program.addCommand(dashboardCommand)`

---

## Constraints & Notes

- All metric names are case-sensitive strings from HAE — use lowercase snake_case as stored
- Dashboard gracefully handles missing metrics (shows `—`)
- No new dependencies required — pure Node.js string formatting
- `--json` on dashboard returns structured object for AI agent consumption
- Workout `duration_min` may need to be computed from `ts` range if not stored directly — check `workouts` table schema

---

## New CLI: `hvault trends`

**File:** `src/cli/trends.ts`

Multi-metric trend analysis over N days with direction arrows. Similar to `whoop trends`.

**Flags:**
- `--days <n>` — window (default: 7, accepts any value)
- `--json` — raw JSON output

**Logic:**
- Fetch per-metric daily averages over N days (same queries as dashboard trends section)
- For each metric: compute avg, min, max, direction (compare first half vs second half average)
- Include sleep from `sleep` table

**Output:**
```
📊 7-Day Trends

👟 Steps:      8,432 avg (6,100–11,200) ↑
💓 Resting HR: 58bpm avg (55–62) ↓
🧠 HRV:        44ms avg (38–52) ↑
😴 Sleep:      7.2h avg (5.5–8.9h) ↑
🔥 Active Cal: 420 kcal avg (280–620) →
```

---

## Files to Create/Modify

| File | Action |
|---|---|
| `package.json` | Edit — add repo/homepage/bugs/keywords |
| `README.md` | Create |
| `docs/COMMANDS.md` | Create |
| `src/cli/dashboard.ts` | Create |
| `src/cli/trends.ts` | Create |
| `src/cli/summary.ts` | Edit — add `--color` flag |
| `src/cli/index.ts` | Edit — register dashboard + trends |
