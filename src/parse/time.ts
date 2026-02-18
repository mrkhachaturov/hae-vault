// HAE outputs 5 different timestamp formats depending on iPhone locale.

function parse24h(date: string, h: string, m: string, s: string, tz: string): Date {
  const tzFormatted = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return new Date(`${date}T${h}:${m}:${s}${tzFormatted}`);
}

function parse12h(date: string, h: string, m: string, s: string, ampm: string, tz: string): Date {
  let hour = parseInt(h, 10);
  const isAm = ampm.toLowerCase() === 'am';
  if (isAm && hour === 12) hour = 0;
  if (!isAm && hour !== 12) hour += 12;
  const hh = String(hour).padStart(2, '0');
  const tzFormatted = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return new Date(`${date}T${hh}:${m}:${s}${tzFormatted}`);
}

export function parseHaeTime(s: string): Date {
  // Try 24-hour format: "2026-01-15 14:30:00 +0000"
  const m24 = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/);
  if (m24) {
    const d = parse24h(m24[1], m24[2], m24[3], m24[4], m24[5]);
    if (!isNaN(d.getTime())) return d;
  }

  // Try 12-hour format (space or narrow non-breaking space \u202f before AM/PM)
  // "2026-01-15 2:30:00 PM +0000" or "2026-01-15 2:30:00\u202fPM +0000"
  const m12 = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2})[\u202f ]([APap][Mm]) ([+-]\d{4})$/);
  if (m12) {
    const d = parse12h(m12[1], m12[2], m12[3], m12[4], m12[5], m12[6]);
    if (!isNaN(d.getTime())) return d;
  }

  throw new Error(`Failed to parse HAE timestamp: "${s}"`);
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
