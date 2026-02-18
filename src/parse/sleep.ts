import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { SleepDatapoint, SleepAnalysisRaw, AggregatedSleepV2, AggregatedSleepV1 } from '../types/hae.js';

export type SleepVariant = 'detailed' | 'aggregated_v2' | 'aggregated_v1';

export interface NormalizedSleep {
  date: string;
  sleep_start: string | null;
  sleep_end: string | null;
  in_bed_start: string | null;
  in_bed_end: string | null;
  core_h: number | null;
  deep_h: number | null;
  rem_h: number | null;
  awake_h: number | null;
  asleep_h: number | null;
  in_bed_h: number | null;
  schema_ver: SleepVariant;
  source: string | null;
  target: string;
  meta: string | null;
  session_id: string | null;
}

export function detectSleepVariant(dp: SleepDatapoint): SleepVariant {
  if ('startDate' in dp && dp.startDate) return 'detailed';
  if ('sleepStart' in dp && 'source' in dp && (dp as AggregatedSleepV2).source) return 'aggregated_v2';
  return 'aggregated_v1';
}

export function normalizeSleep(dp: SleepDatapoint, target: string, sessionId: string | null): NormalizedSleep {
  const variant = detectSleepVariant(dp);

  if (variant === 'detailed') {
    const raw = dp as SleepAnalysisRaw;
    const start = parseHaeTime(raw.startDate);
    return {
      date: toDateStr(start),
      sleep_start: toIso(start),
      sleep_end: toIso(parseHaeTime(raw.endDate)),
      in_bed_start: null, in_bed_end: null,
      core_h: null, deep_h: null, rem_h: null, awake_h: null, asleep_h: null, in_bed_h: null,
      schema_ver: 'detailed',
      source: raw.source,
      target,
      meta: JSON.stringify(dp),
      session_id: sessionId,
    };
  }

  if (variant === 'aggregated_v2') {
    const v2 = dp as AggregatedSleepV2;
    const sleepStart = parseHaeTime(v2.sleepStart);
    return {
      date: toDateStr(sleepStart),
      sleep_start: toIso(sleepStart),
      sleep_end: toIso(parseHaeTime(v2.sleepEnd)),
      in_bed_start: null, in_bed_end: null,
      core_h: v2.core, deep_h: v2.deep, rem_h: v2.rem, awake_h: v2.awake,
      asleep_h: v2.asleep, in_bed_h: v2.inBed,
      schema_ver: 'aggregated_v2',
      source: v2.source,
      target, meta: null, session_id: sessionId,
    };
  }

  // aggregated_v1
  const v1 = dp as AggregatedSleepV1;
  const sleepStart = parseHaeTime(v1.sleepStart);
  return {
    date: toDateStr(sleepStart),
    sleep_start: toIso(sleepStart),
    sleep_end: toIso(parseHaeTime(v1.sleepEnd)),
    in_bed_start: v1.inBedStart ? toIso(parseHaeTime(v1.inBedStart)) : null,
    in_bed_end: v1.inBedEnd ? toIso(parseHaeTime(v1.inBedEnd)) : null,
    core_h: null, deep_h: null, rem_h: null, awake_h: null,
    asleep_h: v1.asleep, in_bed_h: v1.inBed,
    schema_ver: 'aggregated_v1',
    source: v1.sleepSource ?? null,
    target, meta: null, session_id: sessionId,
  };
}
