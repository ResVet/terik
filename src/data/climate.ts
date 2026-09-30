import { createStore, get, set, type UseStore } from 'idb-keyval';
import { toYearBlocks, type ClimateYear } from '../lib/climate/analysis';
import { isValidTimeZone, zoneOffsetMinutes } from '../lib/time/zone';
import { runPooled } from '../workers/client';
import { penalise, record, waitFor } from './budget';
import { RateLimitError } from './http';
import { ARCHIVE_MODEL, archiveWeight, fetchArchive, type Grid, type HourlyWeather } from './openMeteo';
import type { Place } from '../state/store';

export const FIRST_YEAR = 1961;
const CHUNK_YEARS = 5;
/** Bump when the WBGT code changes, so cached results are recomputed from the raw data. */
const PHYSICS_VERSION = 1;
const DAY = 86_400_000;
const HOUR = 3_600_000;

let db: UseStore | null | undefined;
function cacheStore(): UseStore | null {
  if (db === undefined) {
    try {
      db = typeof indexedDB !== 'undefined' ? createStore('terik', 'climate') : null;
    } catch {
      db = null;
    }
  }
  return db;
}

async function cacheGet<T>(key: string): Promise<T | undefined> {
  const store = cacheStore();
  if (!store) return undefined;
  try {
    return await get<T>(key, store);
  } catch {
    return undefined;
  }
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  const store = cacheStore();
  if (!store) return;
  try {
    await set(key, value, store);
  } catch {
    // Quota or private mode: the data still works for this visit.
  }
}

export interface ChunkSpec {
  from: number;
  to: number;
  /** Request window in UTC, padded a day either side for the local-time shift. */
  startDate: string;
  endDate: string;
  /** False while any of its hours could still be missing from the reanalysis. */
  final: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ERA5 arrives about five days late; ask for nothing newer than six days ago. */
export function availableUntil(now = Date.now()): number {
  return Math.floor(now / DAY) * DAY - 6 * DAY;
}

/** The last calendar year the reanalysis fully covers. */
export function lastCompleteYear(now = Date.now()): number {
  return new Date(availableUntil(now)).getUTCFullYear() - 1;
}

/**
 * Five-year chunks from 1961 to the current year, with the recent thirty years
 * first so the newest numbers can show while the older decades download.
 */
export function chunkPlan(now = Date.now()): ChunkSpec[] {
  const until = availableUntil(now);
  const lastYear = new Date(until).getUTCFullYear();
  const chunks: ChunkSpec[] = [];
  for (let from = FIRST_YEAR; from <= lastYear; from += CHUNK_YEARS) {
    const to = Math.min(from + CHUNK_YEARS - 1, lastYear);
    const start = Date.UTC(from, 0, 1) - DAY;
    const wantedEnd = Date.UTC(to + 1, 0, 1);
    const end = Math.min(wantedEnd, until);
    if (end <= start) continue;
    chunks.push({ from, to, startDate: iso(start), endDate: iso(end), final: wantedEnd <= until });
  }
  const recentStart = lastYear - 30;
  return chunks.sort((a, b) => {
    const ra = a.to > recentStart ? 0 : 1;
    const rb = b.to > recentStart ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return ra === 0 ? b.from - a.from : a.from - b.from;
  });
}

/** Standard-time offset in minutes: the smaller of the January and July offsets. */
export function standardOffsetMinutes(timeZone: string | undefined, longitude: number, year: number): number {
  if (timeZone && isValidTimeZone(timeZone)) {
    return Math.min(
      zoneOffsetMinutes(Date.UTC(year, 0, 15), timeZone),
      zoneOffsetMinutes(Date.UTC(year, 6, 15), timeZone),
    );
  }
  return Math.round(longitude / 15) * 60;
}

interface RawEntry {
  version: 1;
  fetchedAt: number;
  grid: Grid;
  start: number;
  count: number;
  airTemperature: Float32Array;
  relativeHumidity: Float32Array;
  windSpeed: Float32Array;
  solar: Float32Array;
}

interface WbgtEntry {
  fetchedAt: number;
  grid: Grid;
  start: number;
  wbgt: Float32Array;
}

function locationKey(place: Place): string {
  return `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
}

function fresh(chunk: ChunkSpec, fetchedAt: number, now: number): boolean {
  return chunk.final || now - fetchedAt < DAY;
}

/** Store hourly data as start + count when the series is evenly spaced (it always is from Open-Meteo). */
function packRaw(weather: HourlyWeather, grid: Grid): RawEntry | null {
  const n = weather.time.length;
  if (n === 0) return null;
  for (let i = 1; i < n; i++) if (weather.time[i]! - weather.time[i - 1]! !== HOUR) return null;
  return {
    version: 1,
    fetchedAt: Date.now(),
    grid,
    start: weather.time[0]!,
    count: n,
    airTemperature: weather.airTemperature,
    relativeHumidity: weather.relativeHumidity,
    windSpeed: weather.windSpeed,
    solar: weather.solar,
  };
}

function unpackRaw(entry: RawEntry): HourlyWeather {
  const time = new Float64Array(entry.count);
  for (let i = 0; i < entry.count; i++) time[i] = entry.start + i * HOUR;
  return {
    time,
    airTemperature: entry.airTemperature,
    relativeHumidity: entry.relativeHumidity,
    windSpeed: entry.windSpeed,
    solar: entry.solar,
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export interface ClimateProgress {
  total: number;
  done: number;
  /** When the current pause to stay inside the rate limit ends (epoch ms), or null. */
  pausedUntil: number | null;
  years: ClimateYear[];
  grid: Grid | null;
}

export interface ClimateData {
  grid: Grid;
  offsetMinutes: number;
  years: ClimateYear[];
  lastCompleteYear: number;
  /** The current, unfinished year is missing or older than a day; a refresh would add to it. */
  stale: boolean;
  /** When this copy was put together, to tell one load from the next. */
  loadedAt: number;
}

interface LoadOptions {
  place: Place;
  timeZone: string | undefined;
  urban: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ClimateProgress) => void;
  /**
   * Never touch the network. Weather already on the device is still turned
   * into WBGT, and the unfinished current year may be old or missing.
   */
  cacheOnly?: boolean;
}

/**
 * Hourly WBGT for every year from 1961, from cache where possible and from the
 * ERA5 archive otherwise. In cache-only mode, returns null unless every
 * finished year is on the device.
 */
export async function loadClimate(options: LoadOptions): Promise<ClimateData | null> {
  const { place, urban, signal, onProgress, cacheOnly = false } = options;
  const now = Date.now();
  const plan = chunkPlan(now);
  const loc = locationKey(place);
  const lastComplete = lastCompleteYear(now);
  const offsetMinutes = standardOffsetMinutes(options.timeZone ?? place.timezone, place.longitude, lastComplete);

  const years = new Map<number, ClimateYear>();
  let grid: Grid | null = null;
  let done = 0;
  // End times of the pauses in progress (two downloads can be waiting at once).
  const pauses = new Map<object, number>();
  const report = () => {
    let until = 0;
    for (const end of pauses.values()) until = Math.max(until, end);
    onProgress?.({
      total: plan.length,
      done,
      pausedUntil: until > Date.now() ? until : null,
      years: [...years.values()].sort((a, b) => a.year - b.year),
      grid,
    });
  };

  const addBlocks = (chunk: ChunkSpec, start: number, wbgt: Float32Array) => {
    const time = new Float64Array(wbgt.length);
    for (let i = 0; i < wbgt.length; i++) time[i] = start + i * HOUR;
    const list: number[] = [];
    for (let y = chunk.from; y <= chunk.to; y++) list.push(y);
    for (const block of toYearBlocks(time, wbgt, offsetMinutes, list)) years.set(block.year, block);
  };

  const wbgtKey = (chunk: ChunkSpec) =>
    `wbgt:${PHYSICS_VERSION}:${loc}:${ARCHIVE_MODEL}:${urban ? 'u' : 'r'}:${chunk.from}`;
  const rawKey = (chunk: ChunkSpec) => `raw:1:${loc}:${ARCHIVE_MODEL}:${chunk.from}`;

  // In cache-only mode an old copy of the unfinished year is better than none.
  let stale = false;
  const usable = (chunk: ChunkSpec, fetchedAt: number) => {
    if (fresh(chunk, fetchedAt, now)) return true;
    if (!cacheOnly) return false;
    stale = true;
    return true;
  };

  // Finished WBGT first, so a repeat visit renders at once.
  const missing: ChunkSpec[] = [];
  for (const chunk of plan) {
    const cached = await cacheGet<WbgtEntry>(wbgtKey(chunk));
    if (cached && usable(chunk, cached.fetchedAt)) {
      grid ??= cached.grid;
      addBlocks(chunk, cached.start, cached.wbgt);
      done++;
    } else {
      missing.push(chunk);
    }
  }
  report();

  // Weather already on the device (say, after switching surroundings) only needs computing.
  const local: [ChunkSpec, RawEntry][] = [];
  const remote: ChunkSpec[] = [];
  for (const chunk of missing) {
    const raw = await cacheGet<RawEntry>(rawKey(chunk));
    if (raw?.version === 1 && usable(chunk, raw.fetchedAt)) local.push([chunk, raw]);
    else remote.push(chunk);
  }
  if (cacheOnly && remote.some((chunk) => chunk.final)) return null;
  if (cacheOnly && remote.length) stale = true;

  const computeChunk = async (chunk: ChunkSpec, raw: RawEntry) => {
    const weather = unpackRaw(raw);
    const wbgt = await runPooled((api) => api.climateChunk(weather, raw.grid, urban));
    await cacheSet(wbgtKey(chunk), {
      fetchedAt: raw.fetchedAt,
      grid: raw.grid,
      start: raw.start,
      wbgt,
    } satisfies WbgtEntry);
    grid ??= raw.grid;
    addBlocks(chunk, raw.start, wbgt);
    done++;
    report();
  };

  await Promise.all(local.map(([chunk, raw]) => computeChunk(chunk, raw)));
  if (cacheOnly) remote.length = 0;

  const fetchChunk = async (chunk: ChunkSpec): Promise<RawEntry> => {
    const days = (Date.parse(chunk.endDate) - Date.parse(chunk.startDate)) / DAY + 1;
    const weight = archiveWeight(days);
    for (;;) {
      const wait = waitFor(weight);
      if (wait > 0) {
        const pause = {};
        pauses.set(pause, Date.now() + wait);
        report();
        try {
          await sleep(wait, signal);
        } finally {
          pauses.delete(pause);
        }
        report();
        continue;
      }
      record(weight);
      try {
        const { grid: g, weather } = await fetchArchive(place, chunk.startDate, chunk.endDate, signal);
        const packed = packRaw(weather, g);
        if (!packed) throw new Error('Archive series has gaps');
        await cacheSet(rawKey(chunk), packed);
        return packed;
      } catch (error) {
        if (error instanceof RateLimitError) {
          penalise(error.retryAfterSeconds);
          continue;
        }
        throw error;
      }
    }
  };

  // Two downloads at a time; each chunk is computed as soon as it lands.
  const queue = [...remote];
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    for (;;) {
      const chunk = queue.shift();
      if (!chunk) return;
      const raw = await fetchChunk(chunk);
      await computeChunk(chunk, raw);
    }
  });
  await Promise.all(workers);

  if (!grid) throw new Error('No climate data for this place');
  return {
    grid,
    offsetMinutes,
    years: [...years.values()].sort((a, b) => a.year - b.year),
    lastCompleteYear: lastComplete,
    stale,
    loadedAt: Date.now(),
  };
}
