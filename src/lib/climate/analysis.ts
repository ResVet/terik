import { bootstrap, type Interval } from '../stats/bootstrap';
import { createRandom } from '../stats/random';
import { quantileSorted } from '../stats/descriptive';
import { fitGev, returnLevel, returnPeriod, type GevParams } from '../stats/gev';
import { trendTest, type TrendResult } from '../stats/trend';
import { assess, isWorkProfile, type Level, type ProfileSettings } from '../guidance/profiles';
import { CLOTHING_ADJUSTMENT, workFraction } from '../guidance/niosh';
import { regionFromClimate, type SportRegion } from '../guidance/sport';

const HOUR = 3_600_000;

/**
 * One calendar year of hourly WBGT in local standard time. Index h holds the
 * value for the hour from h:00 to h+1:00 counted from 1 January 00:00.
 */
export interface ClimateYear {
  year: number;
  wbgt: Float32Array;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function hoursInYear(year: number): number {
  return (isLeapYear(year) ? 366 : 365) * 24;
}

/**
 * Sort hourly values stamped at the end of each averaging hour (UTC) into
 * local-standard-time year blocks. Years without any data are left out.
 */
export function toYearBlocks(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  offsetMinutes: number,
  years: readonly number[],
): ClimateYear[] {
  const blocks = new Map<number, Float32Array>();
  for (const y of years) blocks.set(y, new Float32Array(hoursInYear(y)).fill(Number.NaN));
  const offset = offsetMinutes * 60_000;
  let cachedYear = Number.NaN;
  let cachedStart = 0;
  let cachedEnd = 0;
  for (let i = 0; i < times.length; i++) {
    const local = times[i]! - HOUR / 2 + offset; // middle of the hour, shifted to local
    if (!(local >= cachedStart && local < cachedEnd)) {
      cachedYear = new Date(local).getUTCFullYear();
      cachedStart = Date.UTC(cachedYear, 0, 1);
      cachedEnd = Date.UTC(cachedYear + 1, 0, 1);
    }
    const block = blocks.get(cachedYear);
    if (!block) continue;
    const h = Math.floor((local - cachedStart) / HOUR);
    block[h] = values[i]!;
  }
  return years.filter((y) => blocks.get(y)!.some(Number.isFinite)).map((y) => ({ year: y, wbgt: blocks.get(y)! }));
}

/** Daily maxima (NaN for days with fewer than `minHours` values). */
export function dailyMaxima(block: ClimateYear, minHours = 20): Float32Array {
  const days = block.wbgt.length / 24;
  const out = new Float32Array(days);
  for (let d = 0; d < days; d++) {
    let best = -Infinity;
    let count = 0;
    for (let h = d * 24; h < d * 24 + 24; h++) {
      const v = block.wbgt[h]!;
      if (Number.isFinite(v)) {
        count++;
        if (v > best) best = v;
      }
    }
    out[d] = count >= minHours ? best : Number.NaN;
  }
  return out;
}

/** Drop 29 February so every year lines up on a 365-day calendar. */
export function to365(daily: Float32Array, year: number): Float32Array {
  if (!isLeapYear(year)) return daily;
  const out = new Float32Array(365);
  out.set(daily.subarray(0, 59), 0);
  out.set(daily.subarray(60), 59);
  return out;
}

/** Day of the 365-day calendar (0-364) for a month (1-12) and day. 29 Feb maps to 28 Feb. */
export function dayOf365(month: number, day: number): number {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const d = starts[month - 1]! + day - 1;
  return month === 2 && day === 29 ? 58 : d;
}

export interface Period {
  start: number;
  end: number;
}

export interface PeriodSummary extends Period {
  years: number;
  hotDays: number;
  lostHours: number;
  meanDailyMax: number;
  annualMax: number;
}

export interface SeasonalBand {
  p10: Float32Array;
  p50: Float32Array;
  p90: Float32Array;
}

export interface ReturnCurve {
  /** Return periods in years. */
  periods: number[];
  level: number[];
  /** 90% bootstrap band. */
  low: number[];
  high: number[];
  /** Observed annual maxima at Gringorten plotting positions. */
  points: { period: number; value: number }[];
}

export const RETURN_PERIODS = [1.1, 1.25, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 75, 100];

/** GEV return-level curve with a percentile bootstrap band and the observed maxima. */
export function returnCurve(maxima: number[], replicates: number, seed: number): ReturnCurve {
  const fit = fitGev(maxima);
  const level = RETURN_PERIODS.map((t) => returnLevel(t, fit));
  const random = createRandom(seed);
  const samples = RETURN_PERIODS.map(() => [] as number[]);
  const buffer = new Array<number>(maxima.length);
  for (let r = 0; r < replicates; r++) {
    for (let j = 0; j < maxima.length; j++) buffer[j] = maxima[Math.floor(random() * maxima.length)]!;
    const f = fitGev(buffer);
    if (!Number.isFinite(f.location)) continue;
    RETURN_PERIODS.forEach((t, k) => {
      const v = returnLevel(t, f);
      if (Number.isFinite(v)) samples[k]!.push(v);
    });
  }
  const low: number[] = [];
  const high: number[] = [];
  for (const s of samples) {
    s.sort((a, b) => a - b);
    low.push(quantileSorted(s, 0.05));
    high.push(quantileSorted(s, 0.95));
  }
  const sorted = [...maxima].filter(Number.isFinite).sort((a, b) => b - a);
  const n = sorted.length;
  const points = sorted.map((value, i) => ({ period: (n + 0.12) / (i + 1 - 0.44), value }));
  return { periods: [...RETURN_PERIODS], level, low, high, points };
}

export interface ExtremeComparison {
  baselineCurve: ReturnCurve;
  recentCurve: ReturnCurve;
  baselineFit: GevParams;
  recentFit: GevParams;
  /** The baseline's 1-in-20-year annual maximum, °C. */
  baselineLevel: number;
  /** How often that value now comes around, in years, with a 90% bootstrap interval. */
  recentPeriod: Interval;
  /** The recent period's own 1-in-20-year value, °C. */
  recentLevel: Interval;
}

export interface ClimateAnalysis {
  years: number[];
  /** Daily maxima per complete year on the 365-day calendar. */
  daily: Float32Array[];
  annualMax: number[];
  meanDailyMax: number[];
  hotDays: number[];
  lostHours: number[];
  minLevel: Level;
  trends: {
    hotDays: TrendResult;
    lostHours: TrendResult;
    meanDailyMax: TrendResult;
    annualMax: TrendResult;
  };
  baseline: PeriodSummary;
  recent: PeriodSummary;
  seasonal: { baseline: SeasonalBand; recent: SeasonalBand };
  extremes: ExtremeComparison | null;
  /** 90th percentile of daily maxima in the warmest five months, recent period. */
  warmSeasonP90: number;
  region: SportRegion;
  /** Partial current year, if any. */
  current: { year: number; daily: Float32Array; hotDays: number; lostHours: number; daysWithData: number } | null;
}

/** Local hours counted for "hours lost": 08:00-17:00 for work, 06:00-20:00 for sport. */
export function lostHourRange(settings: ProfileSettings): [number, number] {
  return isWorkProfile(settings.profile) ? [8, 17] : [6, 20];
}

/**
 * For sport, the level from which an hour counts as lost: level 4 cuts
 * training to an hour and level 5 calls it off. A football match only stops
 * at level 5; cooling breaks do not lose the hour.
 */
export function lostLevel(settings: ProfileSettings): Level {
  return settings.profile === 'football' ? 5 : 4;
}

/**
 * Hours lost to heat on one day. For work profiles, the share of each hour
 * that must be rest under the NIOSH limit; for sport, the hours at or above
 * lostLevel().
 */
export function lostHoursOnDay(block: ClimateYear, day: number, settings: ProfileSettings): number {
  const [from, to] = lostHourRange(settings);
  let lost = 0;
  const work = isWorkProfile(settings.profile) ? settings.profile : null;
  const adjustment = CLOTHING_ADJUSTMENT[settings.clothing];
  const threshold = lostLevel(settings);
  for (let h = from; h < to; h++) {
    const v = block.wbgt[day * 24 + h]!;
    if (!Number.isFinite(v)) continue;
    if (work) lost += 1 - workFraction(v + adjustment, work, settings.acclimatised);
    else if (assess(v, settings).level >= threshold) lost += 1;
  }
  return lost;
}

function seasonalBand(daily: Float32Array[], halfWindow = 7): SeasonalBand {
  const p10 = new Float32Array(365);
  const p50 = new Float32Array(365);
  const p90 = new Float32Array(365);
  const pool: number[] = [];
  for (let d = 0; d < 365; d++) {
    pool.length = 0;
    for (const year of daily) {
      for (let k = -halfWindow; k <= halfWindow; k++) {
        const v = year[(d + k + 365) % 365]!;
        if (Number.isFinite(v)) pool.push(v);
      }
    }
    pool.sort((a, b) => a - b);
    p10[d] = quantileSorted(pool, 0.1);
    p50[d] = quantileSorted(pool, 0.5);
    p90[d] = quantileSorted(pool, 0.9);
  }
  return { p10, p50, p90 };
}

/** Start of the warmest run of `length` days on the circular median curve. */
export function warmestWindow(median: Float32Array, length = 153): number {
  let best = -Infinity;
  let bestStart = 0;
  let sum = 0;
  for (let k = 0; k < length; k++) sum += median[k % 365]!;
  for (let s = 0; s < 365; s++) {
    if (sum > best) {
      best = sum;
      bestStart = s;
    }
    sum += median[(s + length) % 365]! - median[s]!;
  }
  return bestStart;
}

function meanOf(values: number[]): number {
  const v = values.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN;
}

function summarise(period: Period, years: number[], series: Record<string, number[]>): PeriodSummary {
  const pick = (name: string) => series[name]!.filter((_, i) => years[i]! >= period.start && years[i]! <= period.end);
  return {
    ...period,
    years: years.filter((y) => y >= period.start && y <= period.end).length,
    hotDays: meanOf(pick('hotDays')),
    lostHours: meanOf(pick('lostHours')),
    meanDailyMax: meanOf(pick('meanDailyMax')),
    annualMax: meanOf(pick('annualMax')),
  };
}

export interface AnalysisOptions {
  settings: ProfileSettings;
  baseline: Period;
  recent: Period;
  /** Days count as hot when the daily peak reaches this level. */
  minLevel?: Level;
  bootstrapReplicates?: number;
}

/** Everything the climate page shows, from complete years plus an optional partial current year. */
export function analyseClimate(
  complete: ClimateYear[],
  partial: ClimateYear | null,
  options: AnalysisOptions,
): ClimateAnalysis {
  const { settings, baseline, recent } = options;
  const minLevel = options.minLevel ?? 3;
  const years: number[] = [];
  const daily: Float32Array[] = [];
  const annualMax: number[] = [];
  const meanDailyMax: number[] = [];
  const hotDays: number[] = [];
  const lostHours: number[] = [];

  const yearStats = (block: ClimateYear) => {
    const dm = dailyMaxima(block);
    let hot = 0;
    let lost = 0;
    let days = 0;
    let sum = 0;
    let peak = -Infinity;
    for (let d = 0; d < dm.length; d++) {
      const v = dm[d]!;
      if (!Number.isFinite(v)) continue;
      days++;
      sum += v;
      if (v > peak) peak = v;
      if (assess(v, settings).level >= minLevel) hot++;
      lost += lostHoursOnDay(block, d, settings);
    }
    return { dm, hot, lost, days, mean: days ? sum / days : Number.NaN, peak: days ? peak : Number.NaN };
  };

  for (const block of [...complete].sort((a, b) => a.year - b.year)) {
    const s = yearStats(block);
    // A year needs most of its days to count; scale counts up for small gaps.
    if (s.days < 330) continue;
    const scale = s.dm.length / s.days;
    years.push(block.year);
    daily.push(to365(s.dm, block.year));
    annualMax.push(s.peak);
    meanDailyMax.push(s.mean);
    hotDays.push(s.hot * scale);
    lostHours.push(s.lost * scale);
  }

  const inPeriod = (p: Period) => daily.filter((_, i) => years[i]! >= p.start && years[i]! <= p.end);
  const series = { hotDays, lostHours, meanDailyMax, annualMax };
  const seasonal = { baseline: seasonalBand(inPeriod(baseline)), recent: seasonalBand(inPeriod(recent)) };

  const maxIn = (p: Period) => annualMax.filter((_, i) => years[i]! >= p.start && years[i]! <= p.end);
  const baseMax = maxIn(baseline);
  const recentMax = maxIn(recent);
  let extremes: ExtremeComparison | null = null;
  if (baseMax.length >= 20 && recentMax.length >= 20) {
    const baselineFit = fitGev(baseMax);
    const recentFit = fitGev(recentMax);
    const baselineLevel = returnLevel(20, baselineFit);
    const replicates = options.bootstrapReplicates ?? 1000;
    if (Number.isFinite(baselineLevel) && Number.isFinite(recentFit.location)) {
      extremes = {
        baselineCurve: returnCurve(baseMax, replicates, 30),
        recentCurve: returnCurve(recentMax, replicates, 31),
        baselineFit,
        recentFit,
        baselineLevel,
        recentPeriod: bootstrap([baseMax, recentMax], (b, r) => returnPeriod(returnLevel(20, fitGev(b)), fitGev(r)), {
          replicates,
          seed: 20,
        }),
        recentLevel: bootstrap([recentMax], (r) => returnLevel(20, fitGev(r)), { replicates, seed: 21 }),
      };
    }
  }

  const start = warmestWindow(seasonal.recent.p50);
  const warmPool: number[] = [];
  for (const year of inPeriod(recent)) {
    for (let k = 0; k < 153; k++) {
      const v = year[(start + k) % 365]!;
      if (Number.isFinite(v)) warmPool.push(v);
    }
  }
  warmPool.sort((a, b) => a - b);
  const warmSeasonP90 = quantileSorted(warmPool, 0.9);

  let current: ClimateAnalysis['current'] = null;
  if (partial) {
    const s = yearStats(partial);
    current = {
      year: partial.year,
      daily: to365(s.dm, partial.year),
      hotDays: s.hot,
      lostHours: s.lost,
      daysWithData: s.days,
    };
  }

  return {
    years,
    daily,
    annualMax,
    meanDailyMax,
    hotDays,
    lostHours,
    minLevel,
    trends: {
      hotDays: trendTest(hotDays, years),
      lostHours: trendTest(lostHours, years),
      meanDailyMax: trendTest(meanDailyMax, years),
      annualMax: trendTest(annualMax, years),
    },
    baseline: summarise(baseline, years, series),
    recent: summarise(recent, years, series),
    seasonal,
    extremes,
    warmSeasonP90,
    region: regionFromClimate(Number.isFinite(warmSeasonP90) ? warmSeasonP90 : 33),
    current,
  };
}

/**
 * Where a daily maximum sits among the recent period's daily maxima within a
 * week either side of the same date: 0.93 means warmer than 93% of them.
 */
export function percentileForDay(
  analysis: ClimateAnalysis,
  dayIndex365: number,
  value: number,
  halfWindow = 7,
): number {
  const pool: number[] = [];
  analysis.daily.forEach((year, i) => {
    const y = analysis.years[i]!;
    if (y < analysis.recent.start || y > analysis.recent.end) return;
    for (let k = -halfWindow; k <= halfWindow; k++) {
      const v = year[(dayIndex365 + k + 365) % 365]!;
      if (Number.isFinite(v)) pool.push(v);
    }
  });
  if (!pool.length || !Number.isFinite(value)) return Number.NaN;
  let below = 0;
  let equal = 0;
  for (const v of pool) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return (below + 0.5 * equal) / pool.length;
}
