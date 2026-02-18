// Raw datapoint from HAE — most metrics
export interface RawDatapoint {
  date: string;
  qty?: number;
  // heart_rate: Min/Avg/Max instead of qty
  Min?: number;
  Avg?: number;
  Max?: number;
  // blood_pressure: systolic/diastolic
  systolic?: number;
  diastolic?: number;
  units?: string;
  source?: string;
}

// Non-aggregated sleep_analysis (each phase as a separate entry)
export interface SleepAnalysisRaw {
  startDate: string;
  endDate: string;
  value: string; // 'ASLEEP_CORE' | 'ASLEEP_DEEP' | 'ASLEEP_REM' | 'INBED' | 'AWAKE'
  source: string;
  qty?: number;
}

// Aggregated sleep v2 (HAE >= 6.6.2): has `source` field
export interface AggregatedSleepV2 {
  sleepStart: string;
  sleepEnd: string;
  core: number;
  deep: number;
  rem: number;
  awake: number;
  asleep: number;
  inBed: number;
  source: string;
}

// Aggregated sleep v1 (HAE < 6.6.2): has sleepSource/inBedSource instead
export interface AggregatedSleepV1 {
  sleepStart: string;
  sleepEnd: string;
  inBedStart: string;
  inBedEnd: string;
  asleep: number;
  inBed: number;
  sleepSource?: string;
  inBedSource?: string;
}

export type SleepDatapoint = SleepAnalysisRaw | AggregatedSleepV2 | AggregatedSleepV1;

export interface MetricData {
  name: string;
  units: string;
  data: RawDatapoint[] | SleepDatapoint[];
}

export interface WorkoutData {
  name: string;
  start: string;
  end: string;
  duration?: number;
  activeEnergyBurned?: { qty: number; units: string };
  distance?: { qty: number; units: string };
  heartRateData?: Array<{ date: string; qty: number; units: string }>;
  heartRateRecovery?: Array<{ date: string; qty: number; units: string }>;
  route?: Array<{ lat: number; lon: number; altitude: number; timestamp: string }>;
  elevation?: { ascent: number; descent: number; units: string };
  [key: string]: unknown; // dynamic fields
}

export interface HaePayload {
  data: {
    metrics?: MetricData[];
    workouts?: WorkoutData[];
    stateOfMind?: unknown[];
    medications?: unknown[];
    symptoms?: unknown[];
    cycleTracking?: unknown[];
    ecg?: unknown[];
    heartRateNotifications?: unknown[];
  };
}

// HAE request headers
export interface HaeHeaders {
  'automation-name'?: string;
  'automation-id'?: string;
  'automation-aggregation'?: string;
  'automation-period'?: string;
  'session-id'?: string;
  'authorization'?: string;
  'x-api-key'?: string;
}
