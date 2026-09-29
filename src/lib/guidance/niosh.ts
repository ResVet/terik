/**
 * NIOSH recommended limits for heat stress (Criteria for a Recommended
 * Standard: Occupational Exposure to Heat and Hot Environments, DHHS (NIOSH)
 * Publication 2016-106). The same equations are the ACGIH TLV and action
 * limit, and the ISO 7243:2017 reference values.
 *
 *   REL (acclimatised)   WBGT = 56.7 - 11.5 log10(M)
 *   RAL (unacclimatised) WBGT = 59.9 - 14.1 log10(M)
 *
 * M is the one-hour time-weighted metabolic rate in watts for a 70 kg worker
 * with 1.8 m² of skin. Rest is assumed to happen in the same heat, so a
 * work/rest cycle lowers M and raises the allowed WBGT. Solving for the share
 * of each hour that can be work gives the familiar 45/15, 30/30, 15/45 cycles.
 */

export type Workload = 'light' | 'moderate' | 'heavy' | 'veryHeavy';

/** Metabolic rates in watts (ACGIH categories, as used by NIOSH). */
export const METABOLIC_RATE: Record<Workload | 'rest', number> = {
  rest: 115,
  light: 180,
  moderate: 300,
  heavy: 415,
  veryHeavy: 520,
};

export type Clothing =
  | 'workClothes'
  | 'clothCoveralls'
  | 'smsCoveralls'
  | 'polyolefinCoveralls'
  | 'doubleLayer'
  | 'vapourBarrier';

/** Clothing adjustment factors, °C-WBGT added to the measured value (ACGIH). */
export const CLOTHING_ADJUSTMENT: Record<Clothing, number> = {
  workClothes: 0,
  clothCoveralls: 0,
  smsCoveralls: 0.5,
  polyolefinCoveralls: 1,
  doubleLayer: 3,
  vapourBarrier: 11,
};

/** WBGT limit (°C) for a time-weighted metabolic rate in watts. */
export function wbgtLimit(metabolicRate: number, acclimatised: boolean): number {
  const logM = Math.log10(metabolicRate);
  return acclimatised ? 56.7 - 11.5 * logM : 59.9 - 14.1 * logM;
}

/** Highest time-weighted metabolic rate (W) allowed at this effective WBGT. */
export function allowedMetabolicRate(effectiveWbgt: number, acclimatised: boolean): number {
  return acclimatised
    ? Math.pow(10, (56.7 - effectiveWbgt) / 11.5)
    : Math.pow(10, (59.9 - effectiveWbgt) / 14.1);
}

/**
 * Share of each hour (0–1) that can be spent working, with rest in the
 * same conditions. 1 means continuous work is within the limit; 0 means even
 * resting in place exceeds it.
 */
export function workFraction(
  effectiveWbgt: number,
  workload: Workload,
  acclimatised: boolean,
): number {
  if (!Number.isFinite(effectiveWbgt)) return Number.NaN;
  const work = METABOLIC_RATE[workload];
  const rest = METABOLIC_RATE.rest;
  const allowed = allowedMetabolicRate(effectiveWbgt, acclimatised);
  if (allowed >= work) return 1;
  if (allowed <= rest) return 0;
  return (allowed - rest) / (work - rest);
}

/** Minutes of work per hour, rounded down to 5 minutes so the advice never exceeds the limit. */
export function workMinutesPerHour(fraction: number): number {
  if (!Number.isFinite(fraction)) return Number.NaN;
  return Math.floor((fraction * 60) / 5 + 1e-9) * 5;
}
