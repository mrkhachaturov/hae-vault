import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetric } from '../src/parse/metrics.js';
import type { MetricData } from '../src/types/hae.js';

const stepMetric: MetricData = {
  name: 'step_count', units: 'count',
  data: [
    { date: '2026-01-15 10:00:00 +0000', qty: 5000 },
    { date: '2026-01-15 11:00:00 +0000', qty: 3000 },
  ]
};

const hrMetric: MetricData = {
  name: 'heart_rate', units: 'bpm',
  data: [{ date: '2026-01-15 10:00:00 +0000', Min: 55, Avg: 72, Max: 130 }]
};

const bpMetric: MetricData = {
  name: 'blood_pressure', units: 'mmHg',
  data: [{ date: '2026-01-15 10:00:00 +0000', systolic: 120, diastolic: 80 }]
};

test('parses basic step_count metric', () => {
  const rows = parseMetric(stepMetric, 'default', 'sess-1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].metric, 'step_count');
  assert.equal(rows[0].qty, 5000);
  assert.equal(rows[0].units, 'count');
  assert.ok(rows[0].ts);
  assert.ok(rows[0].date);
});

test('parses heart_rate metric with Min/Avg/Max', () => {
  const rows = parseMetric(hrMetric, 'default', 'sess-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].min, 55);
  assert.equal(rows[0].avg, 72);
  assert.equal(rows[0].max, 130);
  assert.equal(rows[0].qty, null);
});

test('parses blood_pressure into meta JSON', () => {
  const rows = parseMetric(bpMetric, 'default', 'sess-1');
  assert.equal(rows.length, 1);
  const meta = JSON.parse(rows[0].meta!);
  assert.equal(meta.systolic, 120);
  assert.equal(meta.diastolic, 80);
});

test('returns empty array for sleep_analysis (handled elsewhere)', () => {
  const sleepMetric: MetricData = { name: 'sleep_analysis', units: 'hr', data: [] };
  const rows = parseMetric(sleepMetric, 'default', 'sess-1');
  assert.equal(rows.length, 0);
});
