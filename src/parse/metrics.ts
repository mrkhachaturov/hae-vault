import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { MetricData, RawDatapoint } from '../types/hae.js';

export interface NormalizedMetric {
  ts: string;
  date: string;
  metric: string;
  qty: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  units: string;
  source: string | null;
  target: string;
  meta: string | null;
  session_id: string | null;
}

export function parseMetric(m: MetricData, target: string, sessionId: string | null): NormalizedMetric[] {
  if (m.name === 'sleep_analysis') return [];

  return (m.data as RawDatapoint[]).map((dp) => {
    const d = parseHaeTime(dp.date);
    const isHeartRate = dp.Min !== undefined || dp.Avg !== undefined || dp.Max !== undefined;
    const isBloodPressure = dp.systolic !== undefined || dp.diastolic !== undefined;

    let qty: number | null = null;
    let min: number | null = null;
    let avg: number | null = null;
    let max: number | null = null;
    let meta: string | null = null;

    if (isHeartRate) {
      min = dp.Min ?? null;
      avg = dp.Avg ?? null;
      max = dp.Max ?? null;
    } else if (isBloodPressure) {
      meta = JSON.stringify({ systolic: dp.systolic, diastolic: dp.diastolic });
    } else {
      qty = dp.qty ?? null;
    }

    return {
      ts: toIso(d), date: toDateStr(d),
      metric: m.name, qty, min, avg, max,
      units: m.units, source: dp.source ?? null,
      target, meta, session_id: sessionId,
    };
  });
}
