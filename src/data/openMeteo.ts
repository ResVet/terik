import { getJson } from './http';
import type { Place } from '../state/store';

/**
 * Open-Meteo clients. Everything is requested in SI units with Unix
 * timestamps; hourly radiation is the mean of the preceding hour, which the
 * WBGT code accounts for.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ENSEMBLE = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

export const ENSEMBLE_MODEL = 'icon_seamless_eps';
export const ARCHIVE_MODEL = 'era5_seamless';

const HOURLY_VARS = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'shortwave_radiation'] as const;

export interface HourlyWeather {
  time: Float64Array;
  airTemperature: Float32Array;
  relativeHumidity: Float32Array;
  windSpeed: Float32Array;
  solar: Float32Array;
  pressure?: Float32Array;
}

export interface Grid {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  utcOffsetSeconds: number;
}

export interface Forecast {
  grid: Grid;
  current: {
    time: number;
    intervalSeconds: number;
    airTemperature: number;
    relativeHumidity: number;
    windSpeed: number;
    solar: number;
    pressure: number;
  };
  hourly: HourlyWeather;
  fetchedAt: number;
}

export interface Ensemble {
  model: string;
  time: Float64Array;
  members: HourlyWeather[];
  fetchedAt: number;
}

type Numbers = (number | null)[];

interface RawResponse {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  utc_offset_seconds?: number;
  current?: Record<string, number | null>;
  hourly?: Record<string, Numbers>;
}

const coord = (v: number) => v.toFixed(4);

function toFloat32(values: Numbers | undefined, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = values?.[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN;
  }
  return out;
}

function toTimes(values: Numbers | undefined): Float64Array {
  if (!Array.isArray(values)) throw new Error('Response has no time axis');
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number') throw new Error('Bad timestamp in response');
    out[i] = v * 1000;
  }
  return out;
}

function grid(raw: RawResponse, fallback: Place): Grid {
  return {
    latitude: typeof raw.latitude === 'number' ? raw.latitude : fallback.latitude,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : fallback.longitude,
    elevation:
      typeof raw.elevation === 'number' && Number.isFinite(raw.elevation) ? raw.elevation : (fallback.elevation ?? 0),
    timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : (fallback.timezone ?? 'UTC'),
    utcOffsetSeconds: typeof raw.utc_offset_seconds === 'number' ? raw.utc_offset_seconds : 0,
  };
}

export async function fetchForecast(place: Place, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: coord(place.latitude),
    longitude: coord(place.longitude),
    hourly: [...HOURLY_VARS, 'surface_pressure'].join(','),
    current: [...HOURLY_VARS, 'surface_pressure'].join(','),
    timezone: 'auto',
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    forecast_days: '7',
    past_days: '1',
  });
  const raw = await getJson<RawResponse>(`${FORECAST}?${params}`, { signal });
  const h = raw.hourly;
  const c = raw.current;
  if (!h || !c) throw new Error('Forecast response is missing data');
  const time = toTimes(h.time);
  const n = time.length;
  const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);
  return {
    grid: grid(raw, place),
    current: {
      time: num(c.time) * 1000,
      intervalSeconds: num(c.interval) || 900,
      airTemperature: num(c.temperature_2m),
      relativeHumidity: num(c.relative_humidity_2m),
      windSpeed: num(c.wind_speed_10m),
      solar: num(c.shortwave_radiation),
      pressure: num(c.surface_pressure),
    },
    hourly: {
      time,
      airTemperature: toFloat32(h.temperature_2m, n),
      relativeHumidity: toFloat32(h.relative_humidity_2m, n),
      windSpeed: toFloat32(h.wind_speed_10m, n),
      solar: toFloat32(h.shortwave_radiation, n),
      pressure: toFloat32(h.surface_pressure, n),
    },
    fetchedAt: Date.now(),
  };
}

/**
 * Ensemble members come back as `temperature_2m`, `temperature_2m_member01`,
 * ... A member is used only if all four variables are present for it.
 */
export function parseMembers(hourly: Record<string, Numbers>, n: number): HourlyWeather[] {
  const suffixes = new Set<string>();
  for (const key of Object.keys(hourly)) {
    const m = /^temperature_2m(_member\d+)?$/.exec(key);
    if (m) suffixes.add(m[1] ?? '');
  }
  const members: HourlyWeather[] = [];
  for (const suffix of [...suffixes].sort()) {
    const arrays = HOURLY_VARS.map((v) => hourly[v + suffix]);
    if (arrays.some((a) => !Array.isArray(a))) continue;
    members.push({
      time: new Float64Array(0),
      airTemperature: toFloat32(arrays[0], n),
      relativeHumidity: toFloat32(arrays[1], n),
      windSpeed: toFloat32(arrays[2], n),
      solar: toFloat32(arrays[3], n),
    });
  }
  return members;
}

export async function fetchEnsemble(place: Place, signal?: AbortSignal): Promise<Ensemble> {
  const params = new URLSearchParams({
    latitude: coord(place.latitude),
    longitude: coord(place.longitude),
    hourly: HOURLY_VARS.join(','),
    models: ENSEMBLE_MODEL,
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    forecast_days: '7',
  });
  const raw = await getJson<RawResponse>(`${ENSEMBLE}?${params}`, { signal, timeoutMs: 45_000 });
  if (!raw.hourly) throw new Error('Ensemble response is missing data');
  const time = toTimes(raw.hourly.time);
  const members = parseMembers(raw.hourly, time.length);
  if (members.length < 5) throw new Error('Too few ensemble members');
  for (const m of members) m.time = time;
  return { model: ENSEMBLE_MODEL, time, members, fetchedAt: Date.now() };
}

export interface ArchiveChunk {
  grid: Grid;
  weather: HourlyWeather;
}

/** Hourly reanalysis between two dates (inclusive, YYYY-MM-DD, UTC). */
export async function fetchArchive(
  place: Place,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<ArchiveChunk> {
  const params = new URLSearchParams({
    latitude: coord(place.latitude),
    longitude: coord(place.longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: HOURLY_VARS.join(','),
    models: ARCHIVE_MODEL,
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
  });
  const raw = await getJson<RawResponse>(`${ARCHIVE}?${params}`, { signal, timeoutMs: 90_000, retries: 3 });
  if (!raw.hourly) throw new Error('Archive response is missing data');
  const time = toTimes(raw.hourly.time);
  const n = time.length;
  return {
    grid: grid(raw, place),
    weather: {
      time,
      airTemperature: toFloat32(raw.hourly.temperature_2m, n),
      relativeHumidity: toFloat32(raw.hourly.relative_humidity_2m, n),
      windSpeed: toFloat32(raw.hourly.wind_speed_10m, n),
      solar: toFloat32(raw.hourly.shortwave_radiation, n),
    },
  };
}

/** Request weight as Open-Meteo counts it: variables/10, scaled by days/14 beyond two weeks. */
export function archiveWeight(days: number, variables = HOURLY_VARS.length): number {
  const vars = variables / 10;
  return Math.max(1, vars, (days / 14) * vars);
}

interface GeocodeResult {
  id?: number;
  name?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  feature_code?: string;
  population?: number;
}

export interface PlaceResult extends Place {
  id: string;
  population?: number | undefined;
}

export async function searchPlaces(query: string, language: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ name: q, count: '8', language, format: 'json' });
  const raw = await getJson<{ results?: GeocodeResult[] }>(`${GEOCODE}?${params}`, {
    signal,
    timeoutMs: 12_000,
    retries: 1,
  });
  return (raw.results ?? [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number' && typeof r.name === 'string')
    .map((r) => ({
      id: String(r.id ?? `${r.latitude},${r.longitude}`),
      name: r.name!,
      admin: r.admin1,
      country: r.country,
      countryCode: r.country_code,
      latitude: r.latitude!,
      longitude: r.longitude!,
      elevation: r.elevation,
      timezone: r.timezone,
      population: r.population,
    }));
}

interface ReverseResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
}

/**
 * Name for the device's own position. BigDataCloud's client endpoint is free
 * for exactly this use: called from the browser with coordinates from the
 * Geolocation API.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  language: string,
  signal?: AbortSignal,
): Promise<Partial<Place>> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    localityLanguage: language,
  });
  const raw = await getJson<ReverseResult>(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, {
    signal,
    timeoutMs: 8000,
    retries: 0,
  });
  return {
    name: raw.city || raw.locality || undefined,
    admin: raw.principalSubdivision || undefined,
    country: raw.countryName || undefined,
    countryCode: raw.countryCode || undefined,
  };
}
