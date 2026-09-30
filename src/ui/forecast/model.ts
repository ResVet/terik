import { assess, levelThresholds, type Level, type ProfileSettings } from '../../lib/guidance/profiles';
import { quantileSorted } from '../../lib/stats/descriptive';
import { zonedParts } from '../../lib/time/zone';
import type { ComputedHourly } from '../../workers/compute.worker';
import type { EnsembleWbgt } from '../../workers/compute.worker';

export interface Hour {
  /** Index into the computed hourly arrays. */
  index: number;
  time: number;
  day: number;
  hour: number;
  wbgt: number;
  shade: number;
  air: number;
  humidity: number;
  wind: number;
  solar: number;
  globe: number;
  wetBulb: number;
  level: Level;
  workMinutes: number | null;
  /** Ensemble 10th, 50th, 90th percentiles, if available. */
  p10: number;
  p50: number;
  p90: number;
  /** Share of ensemble members at a higher level than `level`. */
  worseChance: number;
}

export interface Day {
  key: string;
  start: number;
  /** 25 values for 00:00 to 24:00 (the next midnight), NaN where missing. */
  profile: Float32Array;
  hours: Hour[];
  peak: number;
  peakLevel: Level;
}

export interface Week {
  hours: Hour[];
  days: Day[];
  thresholds: [number, number, number, number];
  /** Hours since the first day's midnight, for the "now" marker. */
  nowOffset: number | null;
  members: number;
  min: number;
  max: number;
}

const HOUR = 3_600_000;

function dayKey(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Cut the computed forecast into local days from today onward, attach the
 * risk level for the chosen profile, and line the ensemble up by timestamp.
 */
export function buildWeek(
  hourly: ComputedHourly,
  ensemble: EnsembleWbgt | undefined,
  settings: ProfileSettings,
  timeZone: string,
  now: number,
  dayCount = 7,
): Week {
  const todayKey = dayKey(zonedParts(now, timeZone));
  const thresholds = levelThresholds(settings);

  const ensembleIndex = new Map<number, number>();
  if (ensemble) ensemble.time.forEach((t, i) => ensembleIndex.set(t, i));
  const column = new Float32Array(ensemble?.members ?? 0);

  const days: Day[] = [];
  const dayByKey = new Map<string, Day>();
  const hours: Hour[] = [];
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i]!;
    const parts = zonedParts(time, timeZone);
    const key = dayKey(parts);
    if (key < todayKey) continue;
    let day = dayByKey.get(key);
    if (!day) {
      if (days.length >= dayCount) break;
      day = {
        key,
        start: time - (parts.hour * 60 + parts.minute) * 60_000,
        profile: new Float32Array(25).fill(Number.NaN),
        hours: [],
        peak: -Infinity,
        peakLevel: 1,
      };
      days.push(day);
      dayByKey.set(key, day);
    }
    const wbgt = hourly.wbgt[i]!;
    const { level, workMinutes } = assess(wbgt, settings);

    let p10 = Number.NaN;
    let p50 = Number.NaN;
    let p90 = Number.NaN;
    let worseChance = Number.NaN;
    const e = ensemble ? ensembleIndex.get(time) : undefined;
    if (ensemble && e !== undefined) {
      let n = 0;
      let worse = 0;
      for (let m = 0; m < ensemble.members; m++) {
        const v = ensemble.values[m * ensemble.hours + e]!;
        if (Number.isFinite(v)) {
          column[n++] = v;
          if (assess(v, settings).level > level) worse++;
        }
      }
      if (n >= 5) {
        const sorted = column.subarray(0, n).sort();
        p10 = quantileSorted(sorted, 0.1);
        p50 = quantileSorted(sorted, 0.5);
        p90 = quantileSorted(sorted, 0.9);
        worseChance = worse / n;
      }
    }

    const hour: Hour = {
      index: i,
      time,
      day: days.length - 1,
      hour: parts.hour,
      wbgt,
      shade: hourly.shade[i]!,
      air: hourly.airTemperature[i]!,
      humidity: hourly.relativeHumidity[i]!,
      wind: hourly.windSpeed[i]!,
      solar: hourly.solar[i]!,
      globe: hourly.globe[i]!,
      wetBulb: hourly.naturalWetBulb[i]!,
      level: Number.isFinite(wbgt) ? level : 1,
      workMinutes,
      p10,
      p50,
      p90,
      worseChance,
    };
    hours.push(hour);
    day.hours.push(hour);
    if (Number.isFinite(wbgt)) {
      day.profile[parts.hour] = wbgt;
      if (wbgt > day.peak) {
        day.peak = wbgt;
        day.peakLevel = hour.level;
      }
      min = Math.min(min, wbgt);
      max = Math.max(max, wbgt);
    }
  }

  // Close each day's profile at 24:00 with the next midnight, so the slices meet.
  for (let d = 0; d < days.length; d++) {
    const next = days[d + 1];
    const midnight = next?.profile[0];
    if (midnight !== undefined && Number.isFinite(midnight)) days[d]!.profile[24] = midnight;
    else days[d]!.profile[24] = days[d]!.profile[23]!;
  }

  const first = days[0];
  const nowOffset = first ? (now - first.start) / HOUR : null;
  return {
    hours,
    days,
    thresholds,
    nowOffset: nowOffset !== null && nowOffset >= 0 && nowOffset <= 24 ? nowOffset : null,
    members: ensemble?.members ?? 0,
    min: Number.isFinite(min) ? min : 20,
    max: Number.isFinite(max) ? max : 30,
  };
}

/** Index in `week.hours` of the hour that contains `now`. */
export function currentHourIndex(week: Week, now: number): number {
  let best = 0;
  for (let i = 0; i < week.hours.length; i++) {
    if (week.hours[i]!.time <= now + 30 * 60_000) best = i;
    else break;
  }
  return best;
}
