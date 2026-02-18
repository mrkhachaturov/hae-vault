// tests/parse-time.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHaeTime, toIso, toDateStr } from '../src/parse/time.js';

test('parses 24-hour format', () => {
  const result = parseHaeTime('2026-01-15 14:30:00 +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses 12-hour uppercase PM format', () => {
  const result = parseHaeTime('2026-01-15 2:30:00 PM +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses 12-hour lowercase pm format', () => {
  const result = parseHaeTime('2026-01-15 2:30:00 pm +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses narrow non-breaking space before PM (\\u202f)', () => {
  const result = parseHaeTime('2026-01-15 2:30:00\u202fPM +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('parses narrow non-breaking space before pm (\\u202f)', () => {
  const result = parseHaeTime('2026-01-15 2:30:00\u202fpm +0000');
  assert.equal(toIso(result), '2026-01-15T14:30:00.000Z');
});

test('throws on unrecognised format', () => {
  assert.throws(() => parseHaeTime('not-a-date'), /Failed to parse/);
});

test('toDateStr extracts YYYY-MM-DD', () => {
  const result = parseHaeTime('2026-01-15 14:30:00 +0000');
  assert.equal(toDateStr(result), '2026-01-15');
});

test('handles midnight correctly', () => {
  const result = parseHaeTime('2026-01-15 12:00:00 AM +0000');
  assert.equal(toIso(result), '2026-01-15T00:00:00.000Z');
});

test('handles noon correctly', () => {
  const result = parseHaeTime('2026-01-15 12:00:00 PM +0000');
  assert.equal(toIso(result), '2026-01-15T12:00:00.000Z');
});
