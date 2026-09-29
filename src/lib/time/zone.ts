/**
 * Time zone helpers built on Intl, so a place's wall-clock time is right even
 * when it is not the viewer's own zone, across DST changes included.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(utcMs: number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

/** Offset of the zone from UTC at that instant, in minutes (east positive). */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/** Minutes after local midnight. */
export function localMinutes(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone);
  return p.hour * 60 + p.minute;
}

/** Calendar date in the zone as YYYY-MM-DD. */
export function localDateKey(utcMs: number, timeZone: string): string {
  const p = zonedParts(utcMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
