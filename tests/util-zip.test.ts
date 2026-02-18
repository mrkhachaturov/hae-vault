import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { extractPayloadFromZip } from '../src/util/zip.js';

function makeZip(filename: string, content: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(filename, Buffer.from(content, 'utf-8'));
  return zip.toBuffer();
}

const validPayload = JSON.stringify({ data: { metrics: [], workouts: [] } });

test('extracts payload from zip containing HealthAutoExport-*.json', () => {
  const buf = makeZip('HealthAutoExport-test-2026-01-15.json', validPayload);
  const result = extractPayloadFromZip(buf);
  assert.ok(result);
  assert.deepEqual(result!.data.metrics, []);
});

test('returns null when zip has no HealthAutoExport-*.json', () => {
  const buf = makeZip('workout.gpx', '<gpx/>');
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('returns null when matching entry contains invalid JSON', () => {
  const buf = makeZip('HealthAutoExport-bad.json', 'not json {{{');
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('returns null when JSON lacks data field', () => {
  const buf = makeZip('HealthAutoExport-nodatafield.json', JSON.stringify({ other: true }));
  const result = extractPayloadFromZip(buf);
  assert.equal(result, null);
});

test('ignores .gpx entries and finds the .json', () => {
  const zip = new AdmZip();
  zip.addFile('route.gpx', Buffer.from('<gpx/>', 'utf-8'));
  zip.addFile('HealthAutoExport-2026.json', Buffer.from(validPayload, 'utf-8'));
  const buf = zip.toBuffer();
  const result = extractPayloadFromZip(buf);
  assert.ok(result);
});
