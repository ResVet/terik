/**
 * WBGT activity guidelines for sport.
 *
 * Training and school sport follow the regional thresholds of Grundstein et
 * al. (2015), which the ACSM consensus statement on exertional heat illness
 * (Roberts et al. 2023) recommends. Region category 3 covers the hottest
 * climates; the statement places humid subtropical and hot desert climates
 * outside the US in category 3.
 *
 * Grundstein A, Williams C, Phan M, Cooper E. Regional heat safety thresholds
 * for athletics in the contiguous United States. Appl Geogr. 2015;56:55-60.
 *
 * Football matches use the FIFPRO recommendation: cooling breaks between
 * 28 and 32 °C WBGT, and rescheduling above 32 °C.
 */

export type SportRegion = 1 | 2 | 3;

/**
 * Lower bounds (°C) of levels 2, 3, 4 and 5 for each region category. The
 * published tables are in °F with gaps of 0.1-0.2 °F between bands; each
 * bound here is the midpoint of that gap, converted and rounded to 0.1 °C.
 */
export const SPORT_THRESHOLDS: Record<SportRegion, readonly [number, number, number, number]> = {
  1: [24.6, 27.3, 28.9, 30.1],
  2: [26.6, 29.3, 30.9, 32.1],
  3: [27.8, 30.6, 32.2, 33.4],
};

export const FOOTBALL_THRESHOLDS = { coolingBreaks: 28, reschedule: 32 } as const;

/**
 * Region category from the 90th percentile of warm-season daily maximum WBGT
 * (°C), the statistic Grundstein et al. used to draw the regions:
 * up to 30.0 is category 1, up to 32.2 category 2, higher is category 3.
 */
export function regionFromClimate(p90DailyMaxWbgt: number): SportRegion {
  if (p90DailyMaxWbgt <= 30.0) return 1;
  if (p90DailyMaxWbgt <= 32.2) return 2;
  return 3;
}

/**
 * A starting guess before any climate data is loaded: hot lowland tropics and
 * subtropics are category 3, cool highlands and higher latitudes category 1.
 */
export function regionFromLocation(latitude: number, elevation: number): SportRegion {
  const lat = Math.abs(latitude);
  if (elevation > 1500) return 1;
  if (lat <= 30 && elevation <= 700) return 3;
  if (lat <= 42) return 2;
  return 1;
}
