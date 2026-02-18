import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSleepVariant, normalizeSleep } from '../src/parse/sleep.js';
import type { SleepDatapoint } from '../src/types/hae.js';

const nonAgg: SleepDatapoint = {
  startDate: '2026-01-15 22:00:00 +0000',
  endDate: '2026-01-16 06:00:00 +0000',
  value: 'ASLEEP_CORE',
  source: 'Apple Watch',
  qty: 1.5
};

const aggV2: SleepDatapoint = {
  sleepStart: '2026-01-15 22:00:00 +0000',
  sleepEnd: '2026-01-16 06:00:00 +0000',
  core: 3.0, deep: 1.0, rem: 1.5, awake: 0.5, asleep: 5.5, inBed: 6.0,
  source: 'Apple Watch'
};

const aggV1: SleepDatapoint = {
  sleepStart: '2026-01-15 22:00:00 +0000',
  sleepEnd: '2026-01-16 06:00:00 +0000',
  inBedStart: '2026-01-15 21:50:00 +0000',
  inBedEnd: '2026-01-16 06:10:00 +0000',
  asleep: 5.5, inBed: 6.0,
  sleepSource: "Ruben's Apple Watch",
  inBedSource: 'iPhone'
};

test('detects non-aggregated variant', () => {
  assert.equal(detectSleepVariant(nonAgg), 'detailed');
});

test('detects aggregated v2 variant', () => {
  assert.equal(detectSleepVariant(aggV2), 'aggregated_v2');
});

test('detects aggregated v1 variant', () => {
  assert.equal(detectSleepVariant(aggV1), 'aggregated_v1');
});

test('normalizes aggregated v2', () => {
  const row = normalizeSleep(aggV2, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'aggregated_v2');
  assert.equal(row.core_h, 3.0);
  assert.equal(row.source, 'Apple Watch');
  assert.ok(row.sleep_start);
  assert.ok(row.date);
});

test('normalizes aggregated v1', () => {
  const row = normalizeSleep(aggV1, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'aggregated_v1');
  assert.equal(row.asleep_h, 5.5);
  assert.ok(row.in_bed_start);
});

test('normalizes non-aggregated — stores raw in meta', () => {
  const row = normalizeSleep(nonAgg, 'default', 'sess-1');
  assert.equal(row.schema_ver, 'detailed');
  assert.ok(row.meta);
  const meta = JSON.parse(row.meta!);
  assert.equal(meta.value, 'ASLEEP_CORE');
});
