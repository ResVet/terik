/**
 * Generalised extreme value (GEV) distribution fitted by L-moments.
 *
 * Parameters follow Hosking: location ξ, scale α and shape k, with
 * F(x) = exp(-(1 - k (x - ξ) / α)^(1/k)). k > 0 means the upper tail is
 * bounded, which is the usual case for temperature maxima; scipy's
 * `genextreme` uses the same sign (its `c`).
 *
 * Hosking JRM. L-moments: analysis and estimation of distributions using
 * linear combinations of order statistics. J R Stat Soc B. 1990;52(1):105-24.
 * The shape estimate uses the rational approximations and Newton step of
 * Hosking's PELGEV routine.
 */

export interface LMoments {
  l1: number;
  l2: number;
  t3: number;
}

export interface GevParams {
  location: number;
  scale: number;
  shape: number;
}

/** Unbiased sample L-moments from probability-weighted moments. */
export function sampleLMoments(data: ArrayLike<number>): LMoments {
  const x = Array.from(data)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const n = x.length;
  if (n < 3) return { l1: Number.NaN, l2: Number.NaN, t3: Number.NaN };
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let j = 0; j < n; j++) {
    const v = x[j]!;
    b0 += v;
    b1 += (j / (n - 1)) * v;
    b2 += ((j * (j - 1)) / ((n - 1) * (n - 2))) * v;
  }
  b0 /= n;
  b1 /= n;
  b2 /= n;
  const l1 = b0;
  const l2 = 2 * b1 - b0;
  const l3 = 6 * b2 - 6 * b1 + b0;
  return { l1, l2, t3: l3 / l2 };
}

/** log Γ(x) for x > 0, Lanczos approximation (g = 7, n = 9). */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = c[0]!;
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fit a GEV to sample L-moments. Returns NaN parameters when they are invalid. */
export function fitGevFromLMoments({ l1, l2, t3 }: LMoments): GevParams {
  const invalid = { location: Number.NaN, scale: Number.NaN, shape: Number.NaN };
  if (!(l2 > 0) || !(Math.abs(t3) < 1)) return invalid;

  const small = 1e-5;
  const eps = 1e-6;
  const euler = 0.57721566;
  const dl2 = Math.log(2);
  const dl3 = Math.log(3);

  const fromShape = (k: number): GevParams => {
    const gam = Math.exp(logGamma(1 + k));
    const scale = (l2 * k) / (gam * (1 - Math.pow(2, -k)));
    return { location: l1 - (scale * (1 - gam)) / k, scale, shape: k };
  };

  if (t3 > 0) {
    const z = 1 - t3;
    const k = (-1 + z * (1.59921491 + z * (-0.48832213 + z * 0.01573152))) / (1 + z * (-0.64363929 + z * 0.08985247));
    if (Math.abs(k) < small) {
      const scale = l2 / dl2;
      return { location: l1 - euler * scale, scale, shape: 0 };
    }
    return fromShape(k);
  }

  let k =
    (0.2837753 + t3 * (-1.21096399 + t3 * (-2.50728214 + t3 * (-1.13455566 + t3 * -0.07138022)))) /
    (1 + t3 * (2.06189696 + t3 * (1.31912239 + t3 * 0.25077104)));
  if (t3 >= -0.8) return fromShape(k);
  if (t3 <= -0.97) k = 1 - Math.log(1 + t3) / dl2;

  const target = (t3 + 3) * 0.5;
  for (let it = 1; it < 20; it++) {
    const x2 = Math.pow(2, -k);
    const x3 = Math.pow(3, -k);
    const xx2 = 1 - x2;
    const xx3 = 1 - x3;
    const t = xx3 / xx2;
    const deriv = (xx2 * x3 * dl3 - xx3 * x2 * dl2) / (xx2 * xx2);
    const old = k;
    k -= (t - target) / deriv;
    if (Math.abs(k - old) <= eps * k) return fromShape(k);
  }
  return invalid;
}

export function fitGev(data: ArrayLike<number>): GevParams {
  return fitGevFromLMoments(sampleLMoments(data));
}

export function gevCdf(x: number, { location, scale, shape }: GevParams): number {
  const y = (x - location) / scale;
  if (shape === 0) return Math.exp(-Math.exp(-y));
  const arg = 1 - shape * y;
  if (arg <= 0) return shape > 0 ? 1 : 0;
  return Math.exp(-Math.pow(arg, 1 / shape));
}

export function gevQuantile(f: number, { location, scale, shape }: GevParams): number {
  const w = -Math.log(f);
  if (shape === 0) return location - scale * Math.log(w);
  return location + (scale * (1 - Math.pow(w, shape))) / shape;
}

/** Value exceeded on average once every `years` years, for annual maxima. */
export function returnLevel(years: number, params: GevParams): number {
  return gevQuantile(1 - 1 / years, params);
}

/** Average number of years between annual maxima above `x`. Infinity when x is out of reach. */
export function returnPeriod(x: number, params: GevParams): number {
  const f = gevCdf(x, params);
  return f >= 1 ? Infinity : 1 / (1 - f);
}
