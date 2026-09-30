import { normalCdf, normalQuantile } from './normal';

/**
 * Mann-Kendall trend test with the Hamed & Rao (1998) variance correction for
 * autocorrelation, and the Theil-Sen slope with its Gilbert (1987) confidence
 * interval. The numbers match pyMannKendall's `hamed_rao_modification_test`
 * and `sens_slope` for evenly spaced series.
 *
 * Hamed KH, Rao AR. A modified Mann-Kendall trend test for autocorrelated
 * data. J Hydrol. 1998;204(1-4):182-96.
 * Sen PK. Estimates of the regression coefficient based on Kendall's tau.
 * J Am Stat Assoc. 1968;63(324):1379-89.
 */

export interface TrendResult {
  n: number;
  /** Mann-Kendall S. */
  s: number;
  /** Variance of S after tie and autocorrelation corrections. */
  varianceS: number;
  /** n / n*s, the Hamed-Rao inflation factor applied to the variance. */
  inflation: number;
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** Kendall's tau. */
  tau: number;
  /** Theil-Sen slope per unit of `t`. */
  slope: number;
  /** Lower and upper bounds of the slope's confidence interval. */
  slopeLow: number;
  slopeHigh: number;
  /** Intercept of the Kendall-Theil line at t = t[0], Conover's method. */
  intercept: number;
}

/** Average ranks, 1-based, ties sharing the mean rank (scipy's default). */
export function rank(values: ArrayLike<number>): number[] {
  const n = values.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]!] === values[order[i]!]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]!] = r;
    i = j + 1;
  }
  return ranks;
}

function autocorrelation(x: number[], maxLag: number): number[] {
  const n = x.length;
  let m = 0;
  for (const v of x) m += v;
  m /= n;
  const y = x.map((v) => v - m);
  const acov: number[] = [];
  for (let k = 0; k <= maxLag; k++) {
    let sum = 0;
    for (let t = 0; t + k < n; t++) sum += y[t]! * y[t + k]!;
    acov.push(sum / n);
  }
  return acov.map((v) => v / acov[0]!);
}

/**
 * @param values series values, NaN entries are dropped together with their times
 * @param times  sample times (e.g. years); defaults to 0, 1, 2, ...
 * @param alpha  significance level for the autocorrelation screen and the slope interval
 */
export function trendTest(values: ArrayLike<number>, times?: ArrayLike<number>, alpha = 0.05): TrendResult {
  const x: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) {
      x.push(v);
      t.push(times ? times[i]! : i);
    }
  }
  const n = x.length;
  if (n < 4) {
    return {
      n,
      s: 0,
      varianceS: Number.NaN,
      inflation: Number.NaN,
      z: Number.NaN,
      p: Number.NaN,
      tau: Number.NaN,
      slope: Number.NaN,
      slopeLow: Number.NaN,
      slopeHigh: Number.NaN,
      intercept: Number.NaN,
    };
  }

  // S and all pairwise slopes.
  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = x[j]! - x[i]!;
      s += d > 0 ? 1 : d < 0 ? -1 : 0;
      const dt = t[j]! - t[i]!;
      if (dt !== 0) slopes.push(d / dt);
    }
  }
  slopes.sort((a, b) => a - b);

  // Variance with the tie correction.
  const counts = new Map<number, number>();
  for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const c of counts.values()) tieTerm += c * (c - 1) * (2 * c + 5);
  let varianceS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  const slope = medianSorted(slopes);
  const tSorted = [...t].sort((a, b) => a - b);
  const xSorted = [...x].sort((a, b) => a - b);
  // Conover: the line passes through (median t, median x); report it at t[0].
  const intercept = medianSorted(xSorted) - (medianSorted(tSorted) - t[0]!) * slope;

  // Hamed & Rao: ranks of the detrended series, keep only significant lags.
  const detrended = x.map((v, i) => v - (t[i]! - t[0]!) * slope);
  const ranks = rank(detrended);
  const acf = autocorrelation(ranks, n - 1);
  const bound = normalQuantile(1 - alpha / 2) / Math.sqrt(n);
  let sum = 0;
  for (let i = 1; i < n; i++) {
    const r = acf[i]!;
    if (r > bound || r < -bound) sum += (n - i) * (n - i - 1) * (n - i - 2) * r;
  }
  const inflation = 1 + (2 / (n * (n - 1) * (n - 2))) * sum;
  varianceS *= inflation;

  const z = s > 0 ? (s - 1) / Math.sqrt(varianceS) : s < 0 ? (s + 1) / Math.sqrt(varianceS) : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const tau = s / (0.5 * n * (n - 1));

  // Gilbert (1987) interval on the ordered slopes, using the corrected variance.
  const nSlopes = slopes.length;
  const cAlpha = normalQuantile(1 - alpha / 2) * Math.sqrt(varianceS);
  const lowRank = (nSlopes - cAlpha) / 2; // 1-based
  const highRank = (nSlopes + cAlpha) / 2 + 1;

  return {
    n,
    s,
    varianceS,
    inflation,
    z,
    p,
    tau,
    slope,
    slopeLow: rankValue(slopes, lowRank),
    slopeHigh: rankValue(slopes, highRank),
    intercept,
  };
}

function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid]! : 0.5 * (sorted[mid - 1]! + sorted[mid]!);
}

/** Value at a fractional 1-based rank, clamped to the ends. */
function rankValue(sorted: number[], rank1: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const r = Math.min(n, Math.max(1, rank1)) - 1;
  const lo = Math.floor(r);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (r - lo) * (sorted[hi]! - sorted[lo]!);
}
