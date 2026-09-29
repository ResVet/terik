import {
  CLOTHING_ADJUSTMENT,
  METABOLIC_RATE,
  wbgtLimit,
  workFraction,
  workMinutesPerHour,
  type Clothing,
  type Workload,
} from './niosh';
import { FOOTBALL_THRESHOLDS, SPORT_THRESHOLDS, type SportRegion } from './sport';

/** Five risk levels shared by every profile, from 1 (no restriction) to 5 (stop). */
export type Level = 1 | 2 | 3 | 4 | 5;

export type ProfileId = Workload | 'sport' | 'football';

export const WORK_PROFILES: readonly Workload[] = ['light', 'moderate', 'heavy', 'veryHeavy'];
export const PROFILES: readonly ProfileId[] = [...WORK_PROFILES, 'sport', 'football'];

export interface ProfileSettings {
  profile: ProfileId;
  acclimatised: boolean;
  clothing: Clothing;
  region: SportRegion;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  profile: 'moderate',
  acclimatised: true,
  clothing: 'workClothes',
  region: 3,
};

export function isWorkProfile(profile: ProfileId): profile is Workload {
  return profile !== 'sport' && profile !== 'football';
}

export interface Assessment {
  level: Level;
  /** Work profiles only: minutes of work per hour, in 5-minute steps. */
  workMinutes: number | null;
  /** WBGT plus the clothing adjustment for work profiles, otherwise WBGT. */
  effectiveWbgt: number;
}

/** Share of the hour that can be work at each level boundary (levels 2, 3, 4, 5). */
const WORK_SHARES = [1, 0.75, 0.5, 0.25] as const;

/**
 * WBGT values (°C, before any clothing adjustment) where levels 2, 3, 4 and 5
 * begin for these settings. Charts draw them as reference lines and the
 * ensemble view uses them for exceedance probabilities.
 */
export function levelThresholds(settings: ProfileSettings): [number, number, number, number] {
  const { profile } = settings;
  if (profile === 'sport') return [...SPORT_THRESHOLDS[settings.region]];
  if (profile === 'football') {
    const { coolingBreaks, reschedule } = FOOTBALL_THRESHOLDS;
    return [coolingBreaks, coolingBreaks, reschedule, reschedule];
  }
  const work = METABOLIC_RATE[profile];
  const rest = METABOLIC_RATE.rest;
  const adjustment = CLOTHING_ADJUSTMENT[settings.clothing];
  return WORK_SHARES.map(
    (share) => wbgtLimit(share * work + (1 - share) * rest, settings.acclimatised) - adjustment,
  ) as [number, number, number, number];
}

export function assess(wbgt: number, settings: ProfileSettings): Assessment {
  const { profile } = settings;
  if (!Number.isFinite(wbgt)) return { level: 1, workMinutes: null, effectiveWbgt: Number.NaN };

  if (isWorkProfile(profile)) {
    const effectiveWbgt = wbgt + CLOTHING_ADJUSTMENT[settings.clothing];
    const fraction = workFraction(effectiveWbgt, profile, settings.acclimatised);
    const level: Level = fraction >= 1 ? 1 : fraction >= 0.75 ? 2 : fraction >= 0.5 ? 3 : fraction >= 0.25 ? 4 : 5;
    return { level, workMinutes: workMinutesPerHour(fraction), effectiveWbgt };
  }

  const bounds = levelThresholds(settings);
  let level = 1;
  for (const b of bounds) if (wbgt >= b) level++;
  return { level: level as Level, workMinutes: null, effectiveWbgt: wbgt };
}

/** Level for each value, as a compact typed array (0 marks a missing value). */
export function levelsFor(values: ArrayLike<number>, settings: ProfileSettings): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    out[i] = Number.isFinite(v) ? assess(v, settings).level : 0;
  }
  return out;
}
