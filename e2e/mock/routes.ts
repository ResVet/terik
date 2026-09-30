import type { BrowserContext, Page, Route } from '@playwright/test';
import { hourAt, round } from './weather';

/**
 * Stand-ins for the Open-Meteo forecast, ensemble, archive and geocoding APIs
 * and the BigDataCloud reverse geocoder, answering from the synthetic climate
 * in weather.ts with the same JSON shapes the real services return.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;

interface MockPlace {
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  country: string;
  country_code: string;
  admin1: string;
  population: number;
}

export const PLACES: MockPlace[] = [
  {
    name: 'Jakarta',
    latitude: -6.2146,
    longitude: 106.8451,
    elevation: 8,
    timezone: 'Asia/Jakarta',
    country: 'Indonesia',
    country_code: 'ID',
    admin1: 'Jakarta',
    population: 8_540_000,
  },
  {
    name: 'Surabaya',
    latitude: -7.2492,
    longitude: 112.7508,
    elevation: 7,
    timezone: 'Asia/Jakarta',
    country: 'Indonesia',
    country_code: 'ID',
    admin1: 'East Java',
    population: 2_375_000,
  },
  {
    name: 'Madrid',
    latitude: 40.4165,
    longitude: -3.7026,
    elevation: 667,
    timezone: 'Europe/Madrid',
    country: 'Spain',
    country_code: 'ES',
    admin1: 'Madrid',
    population: 3_256_000,
  },
  {
    name: 'Houston',
    latitude: 29.7633,
    longitude: -95.3633,
    elevation: 15,
    timezone: 'America/Chicago',
    country: 'United States',
    country_code: 'US',
    admin1: 'Texas',
    population: 2_297_000,
  },
  {
    name: 'Doha',
    latitude: 25.2855,
    longitude: 51.531,
    elevation: 10,
    timezone: 'Asia/Qatar',
    country: 'Qatar',
    country_code: 'QA',
    admin1: 'Baladiyat ad Dawhah',
    population: 344_000,
  },
];

function nearest(lat: number, lon: number): MockPlace | undefined {
  return PLACES.find((p) => Math.abs(p.latitude - lat) < 0.3 && Math.abs(p.longitude - lon) < 0.3);
}

/** Offset of a time zone from UTC at a given moment, in seconds. */
function offsetSeconds(timeZone: string, at: number): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part ?? '');
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3] ?? 0) * 60);
}

function zoneFor(lat: number, lon: number): string {
  return nearest(lat, lon)?.timezone ?? 'UTC';
}

const VARS = {
  temperature_2m: (h: ReturnType<typeof hourAt>) => round(h.temperature, 1),
  relative_humidity_2m: (h: ReturnType<typeof hourAt>) => Math.round(h.humidity),
  wind_speed_10m: (h: ReturnType<typeof hourAt>) => round(h.wind, 2),
  shortwave_radiation: (h: ReturnType<typeof hourAt>) => round(h.solar, 1),
  surface_pressure: (h: ReturnType<typeof hourAt>) => round(h.pressure, 1),
} as const;

type VarName = keyof typeof VARS;

function series(lat: number, lon: number, times: number[], names: VarName[], shift?: (t: number) => number) {
  const out: Record<string, number[]> = { time: times.map((t) => t / 1000) };
  for (const name of names) out[name] = [];
  for (const t of times) {
    const h = hourAt(lat, lon, t, shift?.(t) ?? 0);
    for (const name of names) out[name]!.push(VARS[name](h));
  }
  return out;
}

function params(url: URL) {
  const lat = Number(url.searchParams.get('latitude'));
  const lon = Number(url.searchParams.get('longitude'));
  const names = (url.searchParams.get('hourly') ?? '').split(',').filter((n): n is VarName => n in VARS);
  return { lat, lon, names };
}

function gridHeader(lat: number, lon: number, timezone: string, offset: number) {
  return {
    latitude: Math.round(lat * 10) / 10,
    longitude: Math.round(lon * 10) / 10,
    generationtime_ms: 0.8,
    utc_offset_seconds: offset,
    timezone,
    timezone_abbreviation: timezone === 'UTC' ? 'GMT' : 'LMT',
    elevation: nearest(lat, lon)?.elevation ?? 40,
  };
}

function forecast(url: URL) {
  const { lat, lon, names } = params(url);
  const timezone = zoneFor(lat, lon);
  const now = Date.now();
  const offset = offsetSeconds(timezone, now);
  const localMidnight = Math.floor((now + offset * 1000) / DAY) * DAY - offset * 1000;
  const pastDays = Number(url.searchParams.get('past_days') ?? 0);
  const days = Number(url.searchParams.get('forecast_days') ?? 7);
  const start = localMidnight - pastDays * DAY;
  const times = Array.from({ length: (pastDays + days) * 24 }, (_, i) => start + i * HOUR);
  const currentTime = Math.floor(now / 900_000) * 900_000;
  const currentNames = (url.searchParams.get('current') ?? '').split(',').filter((n): n is VarName => n in VARS);
  const nowHour = hourAt(lat, lon, currentTime);
  const current: Record<string, number> = { time: currentTime / 1000, interval: 900 };
  for (const name of currentNames) current[name] = VARS[name](nowHour);
  return { ...gridHeader(lat, lon, timezone, offset), current, hourly: series(lat, lon, times, names) };
}

function ensemble(url: URL) {
  const { lat, lon, names } = params(url);
  const days = Number(url.searchParams.get('forecast_days') ?? 7);
  const start = Math.floor(Date.now() / DAY) * DAY;
  const times = Array.from({ length: days * 24 }, (_, i) => start + i * HOUR);
  const hourly: Record<string, number[]> = { time: times.map((t) => t / 1000) };
  for (let m = 0; m < 40; m++) {
    const suffix = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`;
    const spread = (t: number) => {
      const lead = (t - start) / DAY;
      const k = Math.floor(lead);
      const wobble = Math.sin(m * 12.9898 + k * 78.233) * 43758.5453;
      const n = (wobble - Math.floor(wobble) - 0.5) * 2;
      return m === 0 ? 0 : n * (0.3 + 0.28 * lead);
    };
    const s = series(lat, lon, times, names, spread);
    for (const name of names) hourly[name + suffix] = s[name]!;
  }
  return { ...gridHeader(lat, lon, 'GMT', 0), hourly };
}

function archive(url: URL) {
  const { lat, lon, names } = params(url);
  const from = Date.parse(`${url.searchParams.get('start_date')}T00:00:00Z`);
  const to = Date.parse(`${url.searchParams.get('end_date')}T00:00:00Z`) + DAY;
  const times: number[] = [];
  for (let t = from; t < to; t += HOUR) times.push(t);
  return { ...gridHeader(lat, lon, 'GMT', 0), hourly: series(lat, lon, times, names) };
}

function geocode(url: URL) {
  const name = (url.searchParams.get('name') ?? '').trim().toLowerCase();
  const results = PLACES.filter((p) => p.name.toLowerCase().startsWith(name)).map((p, i) => ({
    id: 900_000 + i,
    ...p,
    feature_code: 'PPLA',
  }));
  return results.length ? { results, generationtime_ms: 0.4 } : { generationtime_ms: 0.4 };
}

function reverse(url: URL) {
  const lat = Number(url.searchParams.get('latitude'));
  const lon = Number(url.searchParams.get('longitude'));
  const p = nearest(lat, lon);
  return {
    latitude: lat,
    longitude: lon,
    city: p?.name ?? '',
    locality: p?.name ?? '',
    principalSubdivision: p?.admin1 ?? '',
    countryName: p?.country ?? '',
    countryCode: p?.country_code ?? '',
  };
}

export interface MockOptions {
  /** Answer archive requests with a server error. */
  failArchive?: boolean;
  /** Answer the ensemble with a server error. */
  failEnsemble?: boolean;
  /** Count requests per service, for assertions. */
  counts?: Record<string, number>;
}

export async function mockApis(target: Page | BrowserContext, options: MockOptions = {}): Promise<void> {
  const reply = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });

  await target.route(/^https:\/\/[a-z-]*\.?open-meteo\.com\//, async (route) => {
    const url = new URL(route.request().url());
    const service = url.hostname.split('.')[0]!;
    if (options.counts) options.counts[service] = (options.counts[service] ?? 0) + 1;
    try {
      if (url.hostname === 'api.open-meteo.com') return await reply(route, forecast(url));
      if (url.hostname === 'ensemble-api.open-meteo.com') {
        return options.failEnsemble
          ? await reply(route, { error: true, reason: 'Mock failure' }, 500)
          : await reply(route, ensemble(url));
      }
      if (url.hostname === 'archive-api.open-meteo.com') {
        return options.failArchive
          ? await reply(route, { error: true, reason: 'Mock failure' }, 500)
          : await reply(route, archive(url));
      }
      if (url.hostname === 'geocoding-api.open-meteo.com') return await reply(route, geocode(url));
      return await reply(route, { error: true, reason: 'Unknown mock endpoint' }, 404);
    } catch (error) {
      return reply(route, { error: true, reason: String(error) }, 500);
    }
  });

  await target.route(/^https:\/\/api\.bigdatacloud\.net\//, (route) =>
    reply(route, reverse(new URL(route.request().url()))),
  );
}
