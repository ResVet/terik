import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../guidance/profiles';
import { localDateKey, localMinutes, zoneOffsetMinutes, zonedParts } from '../time/zone';
import { buildCalendar, escapeText, foldLine } from './ics';
import { bestPerDay, bestWindows, rankWindows } from './windows';

const HOUR = 3_600_000;
const TZ = 'Asia/Jakarta';

/** Three days of a clean diurnal cycle, cooler on day two, starting at local midnight. */
function sampleSeries() {
  const start = Date.UTC(2026, 8, 30, 17); // 00:00 WIB on 1 Oct
  const time: number[] = [];
  const wbgt: number[] = [];
  for (let i = 0; i < 72; i++) {
    const t = start + i * HOUR;
    const hour = (i % 24);
    const dayShift = Math.floor(i / 24) === 1 ? -2 : 0;
    time.push(t);
    wbgt.push(25 + dayShift + 6 * Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12)));
  }
  return { time, wbgt, start };
}

const baseOptions = {
  durationMinutes: 120,
  earliest: 6 * 60,
  latest: 20 * 60,
  settings: DEFAULT_SETTINGS,
  localMinutes: (t: number) => localMinutes(t, TZ),
  localDay: (t: number) => localDateKey(t, TZ),
};

describe('zone helpers', () => {
  it('reads wall-clock time in another zone', () => {
    const p = zonedParts(Date.UTC(2026, 8, 29, 15, 30), TZ);
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 9, 29, 22, 30]);
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 1), TZ)).toBe(420);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 1), 'Europe/London')).toBe(60);
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 1), 'Europe/London')).toBe(0);
  });
});

describe('activity windows', () => {
  it('picks the coolest slot and respects the allowed hours', () => {
    const { time, wbgt, start } = sampleSeries();
    const ranked = rankWindows({ time, wbgt }, { ...baseOptions, notBefore: start });
    expect(ranked.length).toBeGreaterThan(0);
    for (const w of ranked) {
      expect(localMinutes(w.start, TZ)).toBeGreaterThanOrEqual(6 * 60);
      expect(localMinutes(w.start, TZ) + 120).toBeLessThanOrEqual(20 * 60);
    }
    const best = ranked[0]!;
    // Day two is cooler. The synthetic curve is flat at its minimum from 18:00,
    // so 18:00-20:00 beats 06:00-08:00, whose far edge is already warming.
    expect(localDateKey(best.start, TZ)).toBe('2026-10-02');
    expect(localMinutes(best.start, TZ)).toBe(18 * 60);
  });

  it('judges a window on both of its edges', () => {
    const { time, wbgt, start } = sampleSeries();
    const [w] = rankWindows({ time, wbgt }, { ...baseOptions, notBefore: start });
    const i = time.indexOf(w!.start);
    expect(w!.peakWbgt).toBeCloseTo(Math.max(wbgt[i]!, wbgt[i + 1]!, wbgt[i + 2]!), 10);
  });

  it('skips windows that have already started', () => {
    const { time, wbgt, start } = sampleSeries();
    const notBefore = start + 30 * HOUR;
    for (const w of rankWindows({ time, wbgt }, { ...baseOptions, notBefore })) expect(w.start).toBeGreaterThanOrEqual(notBefore);
  });

  it('never returns overlapping windows and gives one per day', () => {
    const { time, wbgt, start } = sampleSeries();
    const ranked = rankWindows({ time, wbgt }, { ...baseOptions, notBefore: start });
    const top = bestWindows(ranked, 3);
    expect(top).toHaveLength(3);
    for (let a = 0; a < top.length; a++)
      for (let b = a + 1; b < top.length; b++)
        expect(top[a]!.end <= top[b]!.start || top[a]!.start >= top[b]!.end).toBe(true);
    expect(bestPerDay(ranked).map((w) => w.day)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('skips windows with missing data', () => {
    const { time, wbgt, start } = sampleSeries();
    wbgt[30] = Number.NaN; // 06:00 on day two
    const ranked = rankWindows({ time, wbgt }, { ...baseOptions, notBefore: start });
    for (const w of ranked) expect(w.start <= time[30]! && w.end >= time[30]!).toBe(false);
  });

  it('prefers the window the ensemble is more confident about when levels tie', () => {
    const time = [0, 1, 2, 3, 4, 5].map((h) => Date.UTC(2026, 9, 1, h)); // 07:00-12:00 WIB
    const wbgt = [26, 26, 26, 26, 26, 26];
    const worseChance = [0.6, 0.6, 0.0, 0.0, 0.0, 0.6];
    const ranked = rankWindows({ time, wbgt, worseChance }, {
      ...baseOptions, durationMinutes: 60, earliest: 0, latest: 1440, notBefore: 0,
    });
    expect(ranked[0]!.worseChance).toBe(0);
  });
});

describe('iCalendar export', () => {
  it('escapes text and folds long lines at 75 octets', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const folded = foldLine('DESCRIPTION:' + 'é'.repeat(60));
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
  });

  it('writes a valid calendar with UTC times', () => {
    const ics = buildCalendar(
      [{ uid: 'x@terik', start: Date.UTC(2026, 9, 2, 0), end: Date.UTC(2026, 9, 2, 2), summary: 'Run, early' }],
      Date.UTC(2026, 8, 29),
    );
    expect(ics).toContain('DTSTART:20261002T000000Z');
    expect(ics).toContain('DTEND:20261002T020000Z');
    expect(ics).toContain('SUMMARY:Run\\, early');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
