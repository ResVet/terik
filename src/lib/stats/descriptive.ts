/** Small descriptive helpers. All of them skip NaN values. */

export function finite(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : Number.NaN;
}

/** Quantile of already sorted values, linear interpolation (Hyndman & Fan type 7, as numpy and R default). */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0]!;
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  // Written so that infinite entries (e.g. "never" return periods) do not turn into NaN.
  if (h === lo || a === b) return a;
  return a + (h - lo) * (b - a);
}

export function quantile(values: ArrayLike<number>, p: number): number {
  const sorted = finite(values).sort((a, b) => a - b);
  return quantileSorted(sorted, p);
}

export function median(values: ArrayLike<number>): number {
  return quantile(values, 0.5);
}

export function max(values: ArrayLike<number>): number {
  let best = -Infinity;
  let seen = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v) && v > best) {
      best = v;
      seen = true;
    }
  }
  return seen ? best : Number.NaN;
}

export function min(values: ArrayLike<number>): number {
  let best = Infinity;
  let seen = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v) && v < best) {
      best = v;
      seen = true;
    }
  }
  return seen ? best : Number.NaN;
}
