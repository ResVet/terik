import { describe, expect, it } from 'vitest';
import reference from './__fixtures__/reference.json';
import { bootstrap } from './bootstrap';
import { quantile } from './descriptive';
import { fitGev, gevCdf, returnLevel, returnPeriod, sampleLMoments } from './gev';
import { normalCdf, normalQuantile } from './normal';
import { createRandom } from './random';
import { rank, trendTest } from './trend';

describe('normal distribution', () => {
  it('matches scipy.stats.norm.cdf', () => {
    reference.normal.x.forEach((x, i) => {
      const expected = reference.normal.cdf[i]!;
      expect(Math.abs(normalCdf(x) - expected)).toBeLessThan(Math.max(1e-7 * expected, 1e-12));
    });
  });
  it('matches scipy.stats.norm.ppf', () => {
    reference.normal.p.forEach((p, i) => {
      expect(normalQuantile(p)).toBeCloseTo(reference.normal.ppf[i]!, 5);
    });
  });
});

describe('quantile', () => {
  it('matches numpy.quantile (linear)', () => {
    reference.quantile.p.forEach((p, i) => {
      expect(quantile(reference.quantile.x, p)).toBeCloseTo(reference.quantile.q[i]!, 12);
    });
  });
});

describe('trend test', () => {
  it('ranks ties with their average rank', () => {
    expect(rank([10, 20, 10, 30])).toEqual([1.5, 3, 1.5, 4]);
  });

  it('reproduces pyMannKendall hamed_rao_modification_test and sens_slope', () => {
    for (const c of reference.trend) {
      const r = trendTest(c.x);
      expect(r.s).toBe(c.s);
      expect(r.varianceS).toBeCloseTo(c.varS, 6);
      expect(r.z).toBeCloseTo(c.z, 6);
      expect(Math.abs(r.p - c.p)).toBeLessThan(1e-6);
      expect(r.tau).toBeCloseTo(c.tau, 10);
      expect(r.slope).toBeCloseTo(c.slope, 10);
      expect(r.intercept).toBeCloseTo(c.intercept, 8);
    }
  });

  it('uses real times for the slope when they are given', () => {
    const years = [2000, 2001, 2003, 2006];
    const values = [1, 2, 4, 7];
    expect(trendTest(values, years).slope).toBeCloseTo(1, 12);
  });

  it('brackets the slope with its confidence interval', () => {
    for (const c of reference.trend) {
      const r = trendTest(c.x);
      expect(r.slopeLow).toBeLessThanOrEqual(r.slope);
      expect(r.slopeHigh).toBeGreaterThanOrEqual(r.slope);
    }
  });

  it('refuses to test fewer than four points', () => {
    expect(Number.isNaN(trendTest([1, 2, 3]).p)).toBe(true);
  });
});

describe('GEV by L-moments', () => {
  it('matches lmoments3 sample L-moments and fitted parameters', () => {
    for (const c of reference.gev) {
      const lm = sampleLMoments(c.x);
      expect(lm.l1).toBeCloseTo(c.l1, 9);
      expect(lm.l2).toBeCloseTo(c.l2, 9);
      expect(lm.t3).toBeCloseTo(c.t3, 9);
      const fit = fitGev(c.x);
      expect(fit.shape).toBeCloseTo(c.shape, 6);
      expect(fit.location).toBeCloseTo(c.location, 6);
      expect(fit.scale).toBeCloseTo(c.scale, 6);
      c.periods.forEach((t, i) => expect(returnLevel(t, fit)).toBeCloseTo(c.levels[i]!, 5));
      expect(gevCdf(c.probe, fit)).toBeCloseTo(c.cdf, 6);
    }
  });

  it('inverts return levels into return periods', () => {
    const fit = fitGev(reference.gev[1]!.x);
    for (const t of [2, 10, 50]) expect(returnPeriod(returnLevel(t, fit), fit)).toBeCloseTo(t, 6);
  });

  it('reports an infinite return period beyond a bounded upper tail', () => {
    const fit = { location: 30, scale: 1, shape: 0.5 }; // upper bound at 32
    expect(returnPeriod(33, fit)).toBe(Infinity);
  });
});

describe('bootstrap', () => {
  it('is reproducible for a given seed and brackets the estimate', () => {
    const random = createRandom(3);
    const sample = Array.from({ length: 40 }, () => random() * 10);
    const meanOf = (s: number[]) => s.reduce((a, b) => a + b, 0) / s.length;
    const a = bootstrap([sample], meanOf, { seed: 11 });
    const b = bootstrap([sample], meanOf, { seed: 11 });
    expect(a).toEqual(b);
    expect(a.low).toBeLessThan(a.estimate);
    expect(a.high).toBeGreaterThan(a.estimate);
  });

  it('produces uniform draws', () => {
    const random = createRandom(42);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) bins[Math.floor(random() * 10)]++;
    for (const b of bins) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });
});
