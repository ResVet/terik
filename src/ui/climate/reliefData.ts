import { dailyMaxima, to365, type ClimateYear } from '../../lib/climate/analysis';

/** The year in 73 steps of five days (73 x 5 = 365, 29 February left out). */
export const BIN_DAYS = 5;
export const BINS = 365 / BIN_DAYS;

const rows = new WeakMap<Float32Array, Float32Array>();

/** Mean daily peak in each five-day step of one year; NaN where fewer than three days have data. */
export function binnedPeaks(year: ClimateYear): Float32Array {
  const hit = rows.get(year.wbgt);
  if (hit) return hit;
  const daily = to365(dailyMaxima(year), year.year);
  const out = new Float32Array(BINS);
  for (let b = 0; b < BINS; b++) {
    let sum = 0;
    let n = 0;
    for (let d = b * BIN_DAYS; d < (b + 1) * BIN_DAYS; d++) {
      const v = daily[d]!;
      if (Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    out[b] = n >= 3 ? sum / n : Number.NaN;
  }
  rows.set(year.wbgt, out);
  return out;
}

export interface YearGrid {
  /** Row-major, rows are years from `first` (oldest) to `last`. NaN where there is no data yet. */
  values: Float32Array;
  rows: number;
  cols: number;
  years: number[];
}

/** One row per year from `first` to `last`, whether or not the year has arrived yet. */
export function yearGrid(years: readonly ClimateYear[], first: number, last: number): YearGrid {
  const count = Math.max(0, last - first + 1);
  const values = new Float32Array(count * BINS).fill(Number.NaN);
  for (const y of years) {
    const r = y.year - first;
    if (r < 0 || r >= count) continue;
    values.set(binnedPeaks(y), r * BINS);
  }
  return { values, rows: count, cols: BINS, years: Array.from({ length: count }, (_, r) => first + r) };
}

/** The hottest cell in the grid, or null when it is empty. */
export function hottestCell(grid: YearGrid): { row: number; col: number } | null {
  let best = -Infinity;
  let at = -1;
  for (let i = 0; i < grid.values.length; i++) {
    const v = grid.values[i]!;
    if (v > best) {
      best = v;
      at = i;
    }
  }
  return at < 0 ? null : { row: Math.floor(at / grid.cols), col: at % grid.cols };
}

/** First and last day (0-364 on the 365-day calendar) of a five-day step. */
export function binDays(col: number): [number, number] {
  return [col * BIN_DAYS, col * BIN_DAYS + BIN_DAYS - 1];
}
