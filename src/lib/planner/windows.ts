import { assess, type Level, type ProfileSettings } from '../guidance/profiles';

export interface PlannerSeries {
  /** Unix ms of each hourly value, ascending. */
  time: ArrayLike<number>;
  wbgt: ArrayLike<number>;
  /**
   * Optional per-hour chance (0-1) that the level ends up higher than the
   * deterministic forecast says, from the ensemble.
   */
  worseChance?: ArrayLike<number> | undefined;
}

export interface PlannerOptions {
  /** Activity length in minutes, a multiple of 60 from 60 to 480. */
  durationMinutes: number;
  /** Earliest local start, minutes after midnight. */
  earliest: number;
  /** Latest local end, minutes after midnight (up to 1440). */
  latest: number;
  /** Candidate starts before this instant are ignored (usually "now"). */
  notBefore: number;
  settings: ProfileSettings;
  /** Local wall-clock minutes after midnight for an instant. */
  localMinutes: (utcMs: number) => number;
  /** Local calendar day key for an instant. */
  localDay: (utcMs: number) => string;
}

export interface ActivityWindow {
  start: number;
  end: number;
  day: string;
  peakWbgt: number;
  meanWbgt: number;
  peakLevel: Level;
  /** Highest ensemble chance of a worse level within the window, if known. */
  worseChance: number | null;
}

const HOUR = 3_600_000;

/**
 * Every feasible window, ranked. A window uses every hourly value from its
 * start to its end inclusive, so a two-hour slot is judged on three readings
 * and the worse edge always counts.
 */
export function rankWindows(series: PlannerSeries, options: PlannerOptions): ActivityWindow[] {
  const { time, wbgt } = series;
  const n = time.length;
  const steps = Math.round(options.durationMinutes / 60);
  const out: ActivityWindow[] = [];
  if (steps < 1) return out;

  for (let i = 0; i + steps < n; i++) {
    const start = time[i]!;
    const end = time[i + steps]!;
    if (start < options.notBefore) continue;
    if (end - start !== steps * HOUR) continue; // a gap in the data
    const startLocal = options.localMinutes(start);
    const endLocal = startLocal + options.durationMinutes;
    if (startLocal < options.earliest || endLocal > options.latest) continue;
    if (options.localDay(start) !== options.localDay(end - 1)) continue;

    let peak = -Infinity;
    let sum = 0;
    let chance: number | null = series.worseChance ? 0 : null;
    let ok = true;
    for (let j = i; j <= i + steps; j++) {
      const v = wbgt[j]!;
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      peak = Math.max(peak, v);
      sum += v;
      if (chance !== null) {
        const c = series.worseChance![j]!;
        if (Number.isFinite(c)) chance = Math.max(chance, c);
      }
    }
    if (!ok) continue;
    out.push({
      start,
      end,
      day: options.localDay(start),
      peakWbgt: peak,
      meanWbgt: sum / (steps + 1),
      peakLevel: assess(peak, options.settings).level,
      worseChance: chance,
    });
  }

  return out.sort(compareWindows);
}

export function compareWindows(a: ActivityWindow, b: ActivityWindow): number {
  if (a.peakLevel !== b.peakLevel) return a.peakLevel - b.peakLevel;
  // Ensemble risk only breaks near-ties: 10 percentage-point bins.
  const ra = a.worseChance === null ? 0 : Math.round(a.worseChance * 10);
  const rb = b.worseChance === null ? 0 : Math.round(b.worseChance * 10);
  if (ra !== rb) return ra - rb;
  if (Math.abs(a.peakWbgt - b.peakWbgt) > 0.05) return a.peakWbgt - b.peakWbgt;
  if (Math.abs(a.meanWbgt - b.meanWbgt) > 0.05) return a.meanWbgt - b.meanWbgt;
  return a.start - b.start;
}

/** The best `count` windows that do not overlap each other. */
export function bestWindows(ranked: ActivityWindow[], count: number): ActivityWindow[] {
  const chosen: ActivityWindow[] = [];
  for (const w of ranked) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => w.end <= c.start || w.start >= c.end)) chosen.push(w);
  }
  return chosen;
}

/** The best window on each local day, in date order. */
export function bestPerDay(ranked: ActivityWindow[]): ActivityWindow[] {
  const byDay = new Map<string, ActivityWindow>();
  for (const w of ranked) if (!byDay.has(w.day)) byDay.set(w.day, w);
  return [...byDay.values()].sort((a, b) => a.start - b.start);
}
