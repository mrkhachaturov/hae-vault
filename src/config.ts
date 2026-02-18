import { config as dotenvLoad } from 'dotenv';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return homedir() + p.slice(1);
  }
  return p;
}

// Load .env: HVAULT_ENV_FILE env var overrides; fallback to CWD .env
const envFile = process.env.HVAULT_ENV_FILE ?? join(process.cwd(), '.env');
if (existsSync(envFile)) {
  dotenvLoad({ path: envFile });
}

const DEFAULT_DB_PATH = join(homedir(), '.hae-vault', 'health.db');

export const config = {
  dbPath:        expandTilde(process.env.HVAULT_DB_PATH ?? DEFAULT_DB_PATH),
  port:          Number(process.env.HVAULT_PORT ?? 4242),
  token:         process.env.HVAULT_TOKEN,
  watchDir:      process.env.HVAULT_WATCH_DIR ? expandTilde(process.env.HVAULT_WATCH_DIR) : undefined,
  watchInterval: Number(process.env.HVAULT_WATCH_INTERVAL ?? 60),
  target:        process.env.HVAULT_TARGET ?? 'default',
} as const;
