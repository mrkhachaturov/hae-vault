import { parseHaeTime, toIso, toDateStr } from './time.js';
import type { WorkoutData } from '../types/hae.js';

export interface NormalizedWorkout {
  ts: string;
  date: string;
  name: string;
  duration_s: number | null;
  calories_kj: number | null;
  distance: number | null;
  distance_unit: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  target: string;
  meta: string;
  session_id: string | null;
}

export function parseWorkout(w: WorkoutData, target: string, sessionId: string | null): NormalizedWorkout {
  const start = parseHaeTime(w.start);
  const end = parseHaeTime(w.end);
  const duration_s = Math.round((end.getTime() - start.getTime()) / 1000);

  const hrValues = (w.heartRateData ?? []).map((h) => h.qty).filter((v): v is number => typeof v === 'number');
  const avg_hr = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : null;
  const max_hr = hrValues.length > 0 ? Math.max(...hrValues) : null;

  return {
    ts: toIso(start),
    date: toDateStr(start),
    name: w.name,
    duration_s,
    calories_kj: w.activeEnergyBurned?.qty ?? null,
    distance: w.distance?.qty ?? null,
    distance_unit: w.distance?.units ?? null,
    avg_hr,
    max_hr,
    target,
    meta: JSON.stringify(w),
    session_id: sessionId,
  };
}
