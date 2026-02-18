import AdmZip from 'adm-zip';
import type { HaePayload } from '../types/hae.js';

const HAE_JSON_PATTERN = /HealthAutoExport.*\.json$/i;

export function extractPayloadFromZip(buf: Buffer): HaePayload | null {
  try {
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find(e => HAE_JSON_PATTERN.test(e.entryName));
    if (!entry) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(entry.getData().toString('utf-8'));
    } catch {
      return null;
    }

    if (!payload || typeof payload !== 'object' || !('data' in payload)) return null;
    return payload as HaePayload;
  } catch {
    return null;
  }
}
