/**
 * Minimal iCalendar (RFC 5545) writer for exporting planned activity windows.
 * Times are written in UTC, so any calendar app shows them in its own zone.
 */

export interface CalendarEvent {
  uid: string;
  start: number;
  end: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape text values (section 3.3.11). */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (section 3.1), without splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      out.push(current);
      current = '';
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendar(events: CalendarEvent[], now = Date.now()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Terik//Heat plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp(now)}`);
    lines.push(`DTSTART:${stamp(e.start)}`);
    lines.push(`DTEND:${stamp(e.end)}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
