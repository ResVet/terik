import { wrap, type Remote } from 'comlink';
import type { ComputeApi } from './compute.worker';

/**
 * A small pool of compute workers. The first one serves forecasts; the climate
 * download spreads its chunks over all of them.
 */

let pool: Remote<ComputeApi>[] | null = null;
let busy: number[] = [];

function create(): Remote<ComputeApi> {
  const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module', name: 'terik-compute' });
  return wrap<ComputeApi>(worker);
}

function size(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

function ensurePool(): Remote<ComputeApi>[] {
  if (!pool) {
    pool = [create()];
    busy = [0];
  }
  return pool;
}

/** The main compute worker. */
export function compute(): Remote<ComputeApi> {
  return ensurePool()[0]!;
}

/** Run a job on the least busy worker, growing the pool up to the core budget. */
export async function runPooled<T>(job: (api: Remote<ComputeApi>) => Promise<T>): Promise<T> {
  const workers = ensurePool();
  let index = busy.indexOf(Math.min(...busy));
  if (busy[index]! > 0 && workers.length < size()) {
    workers.push(create());
    busy.push(0);
    index = workers.length - 1;
  }
  busy[index]!++;
  try {
    return await job(workers[index]!);
  } finally {
    busy[index]!--;
  }
}
