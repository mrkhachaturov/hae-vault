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
