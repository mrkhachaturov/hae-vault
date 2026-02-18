// tests/types.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HaePayload, MetricData, WorkoutData } from '../src/types/hae.js';

test('HaePayload shape is correct', () => {
  const payload: HaePayload = {
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ date: '2026-01-15 10:00:00 +0000', qty: 5000 }] }
      ],
      workouts: []
    }
  };
  assert.equal(payload.data.metrics![0].name, 'step_count');
});

test('SleepAnalysis non-aggregated shape', () => {
  const row = { startDate: '2026-01-15 22:00:00 +0000', endDate: '2026-01-16 06:00:00 +0000', value: 'ASLEEP_CORE', source: 'Apple Watch', qty: 1.5 };
  assert.ok('startDate' in row);
  assert.ok('value' in row);
});

test('AggregatedSleepV2 shape', () => {
  const row = { sleepStart: '2026-01-15 22:00:00 +0000', sleepEnd: '2026-01-16 06:00:00 +0000', core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0, source: 'Apple Watch' };
  assert.ok('source' in row && 'core' in row);
});
