---
name: hae-vault
description: >
  Apple Health archive database. Use for: historical Apple Health data (steps,
  heart rate, HRV, sleep, workouts, mindfulness, respiratory rate, blood oxygen
  from iPhone/Apple Watch), multi-day trends, long-term patterns. Data comes
  from Health Auto Export iOS app synced to local SQLite.
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
