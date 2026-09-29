import { quantileSorted } from './descriptive';
import { createRandom } from './random';

export interface Interval {
  estimate: number;
  low: number;
  high: number;
}

/**
 * Percentile bootstrap. `statistic` receives resampled copies of each input
 * sample (resampled independently) and returns one number; non-finite
 * replicates are dropped. With a fixed seed the interval is reproducible.
 */
export function bootstrap(
  samples: number[][],
  statistic: (...resampled: number[][]) => number,
  { replicates = 1000, level = 0.9, seed = 1 }: { replicates?: number; level?: number; seed?: number } = {},
): Interval {
  const random = createRandom(seed);
  const estimate = statistic(...samples);
  const values: number[] = [];
  const buffers = samples.map((s) => new Array<number>(s.length));
  for (let r = 0; r < replicates; r++) {
    samples.forEach((sample, i) => {
      const buf = buffers[i]!;
      for (let j = 0; j < sample.length; j++) buf[j] = sample[Math.floor(random() * sample.length)]!;
    });
    const v = statistic(...buffers);
    if (Number.isFinite(v)) values.push(v);
    else if (v === Infinity) values.push(Infinity);
  }
  values.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return {
    estimate,
    low: quantileSorted(values, tail),
    high: quantileSorted(values, 1 - tail),
  };
}
