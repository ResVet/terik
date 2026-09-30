import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../guidance/profiles';
import { createRandom } from '../stats/random';
import {
  analyseClimate,
  dailyMaxima,
  dayOf365,
  hoursInYear,
  lostHoursOnDay,
  lostLevel,
  percentileForDay,
  RETURN_PERIODS,
  returnCurve,
  to365,
  toYearBlocks,
  warmestWindow,
  type ClimateYear,
} from './analysis';

/** Synthetic hourly WBGT: seasonal and daily cycles, noise, and +0.3 °C per decade. */
function synthetic(fromYear: number, toYear: number, seed = 5): ClimateYear[] {
  const random = createRandom(seed);
  const out: ClimateYear[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const n = hoursInYear(y);
    const wbgt = new Float32Array(n);
    let dayNoise = 0;
    for (let h = 0; h < n; h++) {
      if (h % 24 === 0) dayNoise = 0.6 * dayNoise + (random() - 0.5) * 2.2;
      const doy = Math.floor(h / 24);
      const hour = h % 24;
      const seasonal = 1.5 * Math.cos((2 * Math.PI * (doy - 120)) / 365);
      const diurnal = 5.5 * Math.max(0, Math.sin((Math.PI * (hour - 6)) / 13));
      wbgt[h] = 24.5 + 0.03 * (y - fromYear) + seasonal + diurnal + dayNoise;
    }
    out.push({ year: y, wbgt });
  }
  return out;
}

describe('calendar helpers', () => {
  it('drops 29 February', () => {
    const d = new Float32Array(366).map((_, i) => i);
    const out = to365(d, 2024);
    expect(out.length).toBe(365);
    expect(out[58]).toBe(58);
    expect(out[59]).toBe(60);
    expect(dayOf365(3, 1)).toBe(59);
    expect(dayOf365(2, 29)).toBe(58);
    expect(dayOf365(12, 31)).toBe(364);
  });

  it('finds the warmest run of days on a circular calendar', () => {
    const median = new Float32Array(365).map((_, d) => Math.cos((2 * Math.PI * (d - 10)) / 365));
    const start = warmestWindow(median, 153);
    // Centred on day 10, so it starts about 76 days earlier, wrapping into December.
    expect((start + 76) % 365).toBeGreaterThanOrEqual(8);
    expect((start + 76) % 365).toBeLessThanOrEqual(12);
  });

  it('places UTC-stamped hours into local standard time years', () => {
    const offset = 7 * 60;
    const times: number[] = [];
    const values: number[] = [];
    // Hours ending 1961-01-01T00:00Z ... cover local 07:00 onwards of 1 Jan.
    for (let i = 0; i < 48; i++) {
      times.push(Date.UTC(1961, 0, 1, i));
      values.push(i);
    }
    const [block] = toYearBlocks(times, values, offset, [1961]);
    expect(block!.year).toBe(1961);
    // The value stamped 00:00Z covers 23:00-00:00Z, which is 06:00-07:00 local.
    expect(block!.wbgt[6]).toBe(0);
    expect(block!.wbgt[7]).toBe(1);
    expect(Number.isNaN(block!.wbgt[5]!)).toBe(true);
    expect(dailyMaxima(block!)[0]).toBeNaN(); // only 18 hours on day one
  });
});

describe('analyseClimate', () => {
  const years = synthetic(1961, 2025);
  const partial = synthetic(2026, 2026)[0]!;
  partial.wbgt.fill(Number.NaN, 24 * 200);
  const analysis = analyseClimate(years, partial, {
    settings: DEFAULT_SETTINGS,
    baseline: { start: 1961, end: 1990 },
    recent: { start: 1996, end: 2025 },
    bootstrapReplicates: 300,
  });

  it('keeps every complete year and recovers the imposed warming', () => {
    expect(analysis.years).toHaveLength(65);
    const t = analysis.trends.meanDailyMax;
    expect(t.slope).toBeGreaterThan(0.025);
    expect(t.slope).toBeLessThan(0.035);
    expect(t.p).toBeLessThan(0.001);
    expect(t.slopeLow).toBeLessThan(t.slope);
    expect(t.slopeHigh).toBeGreaterThan(t.slope);
  });

  it('counts more hot days and more lost hours in the recent period', () => {
    expect(analysis.recent.hotDays).toBeGreaterThan(analysis.baseline.hotDays);
    expect(analysis.recent.lostHours).toBeGreaterThan(analysis.baseline.lostHours);
    expect(analysis.trends.hotDays.slope).toBeGreaterThan(0);
  });

  it('shows the old 1-in-20-year maximum arriving more often', () => {
    const e = analysis.extremes!;
    expect(e).not.toBeNull();
    expect(e.recentPeriod.estimate).toBeLessThan(20);
    expect(e.recentPeriod.low).toBeLessThanOrEqual(e.recentPeriod.estimate);
    expect(e.recentLevel.estimate).toBeGreaterThan(e.baselineLevel);
  });

  it('builds a seasonal band that is ordered and warmer recently', () => {
    const { baseline, recent } = analysis.seasonal;
    for (let d = 0; d < 365; d += 30) {
      expect(recent.p10[d]!).toBeLessThanOrEqual(recent.p50[d]!);
      expect(recent.p50[d]!).toBeLessThanOrEqual(recent.p90[d]!);
      expect(recent.p50[d]!).toBeGreaterThan(baseline.p50[d]!);
    }
  });

  it('derives the sport region from the warm-season 90th percentile', () => {
    expect(analysis.warmSeasonP90).toBeGreaterThan(30);
    expect([1, 2, 3]).toContain(analysis.region);
  });

  it('summarises the partial current year', () => {
    expect(analysis.current!.year).toBe(2026);
    expect(analysis.current!.daysWithData).toBe(200);
  });

  it('ranks a forecast day against the same time of year', () => {
    const day = dayOf365(4, 30);
    const typical = analysis.seasonal.recent.p50[day]!;
    expect(percentileForDay(analysis, day, typical)).toBeGreaterThan(0.4);
    expect(percentileForDay(analysis, day, typical)).toBeLessThan(0.6);
    expect(percentileForDay(analysis, day, typical + 10)).toBe(1);
  });
});

describe('return curves', () => {
  const maxima = synthetic(1961, 1990).map((block) => Math.max(...Array.from(block.wbgt)));

  it('rises with the return period and brackets the fit with its bootstrap band', () => {
    const curve = returnCurve(maxima, 300, 7);
    expect(curve.periods).toEqual(RETURN_PERIODS);
    for (let i = 1; i < curve.level.length; i++) expect(curve.level[i]!).toBeGreaterThan(curve.level[i - 1]!);
    curve.level.forEach((v, i) => {
      expect(curve.low[i]!).toBeLessThanOrEqual(v + 1e-9);
      expect(curve.high[i]!).toBeGreaterThanOrEqual(v - 1e-9);
    });
  });

  it('places the observed maxima at Gringorten positions, largest first', () => {
    const { points } = returnCurve(maxima, 50, 7);
    expect(points).toHaveLength(maxima.length);
    expect(points[0]!.value).toBe(Math.max(...maxima));
    expect(points[0]!.period).toBeCloseTo((30 + 0.12) / (1 - 0.44), 10);
    for (let i = 1; i < points.length; i++) expect(points[i]!.period).toBeLessThan(points[i - 1]!.period);
  });

  it('is reproducible for a given seed', () => {
    expect(returnCurve(maxima, 100, 3)).toEqual(returnCurve(maxima, 100, 3));
  });
});

describe('hours lost to heat', () => {
  // A day at a flat WBGT from 00:00 to 24:00.
  const flat = (wbgt: number): ClimateYear => ({ year: 2001, wbgt: new Float32Array(hoursInYear(2001)).fill(wbgt) });
  const day = flat(30);
  const sport = { ...DEFAULT_SETTINGS, profile: 'sport' as const, region: 1 as const };
  const football = { ...DEFAULT_SETTINGS, profile: 'football' as const };

  it('counts sport hours from level 4 and football hours only at level 5', () => {
    expect(lostLevel(sport)).toBe(4);
    expect(lostLevel(football)).toBe(5);
    // 06:00 to 20:00 is 14 hours. Region 1 sport reaches level 4 at 28.9 °C.
    expect(lostHoursOnDay(flat(29.5), 0, sport)).toBe(14);
    expect(lostHoursOnDay(flat(28.5), 0, sport)).toBe(0);
    // Football: cooling breaks (level 3) at 27 °C lose nothing; postponement from 28 °C does.
    expect(lostHoursOnDay(flat(27), 0, football)).toBe(0);
    expect(lostHoursOnDay(flat(28.5), 0, football)).toBe(14);
  });

  it('counts the required rest share for work, within 08:00 to 17:00', () => {
    const heavy = { ...DEFAULT_SETTINGS, profile: 'heavy' as const };
    const lost = lostHoursOnDay(day, 0, heavy);
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(9);
  });
});
