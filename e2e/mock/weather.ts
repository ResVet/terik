/**
 * A made-up but physically sensible climate for any latitude, used to stand
 * in for Open-Meteo in end-to-end tests. Everything is deterministic: the
 * same place and hour always give the same numbers.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const EPOCH = Date.UTC(1959, 0, 1);

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function gauss(n: number): number {
  const u = Math.max(1e-9, hash(n * 2 + 1));
  const v = hash(n * 2 + 2);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Daily {
  temperature: Float32Array;
  humidity: Float32Array;
  cloud: Float32Array;
}

const cache = new Map<string, Daily>();

/** Day-to-day weather: persistent temperature and moisture anomalies and a cloud factor. */
function daily(lat: number, lon: number): Daily {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const days = Math.ceil((Date.UTC(2031, 0, 1) - EPOCH) / DAY);
  const seed = Math.round((lat + 90) * 100) * 40_000 + Math.round((lon + 180) * 100);
  const spread = 1.1 + 0.05 * Math.max(0, Math.abs(lat) - 15);
  const temperature = new Float32Array(days);
  const humidity = new Float32Array(days);
  const cloud = new Float32Array(days);
  let t = 0;
  let h = 0;
  let c = 0;
  for (let d = 0; d < days; d++) {
    t = 0.72 * t + spread * 0.69 * gauss(seed * 3 + d * 7);
    h = 0.6 * h + 0.8 * gauss(seed * 5 + d * 11);
    c = 0.5 * c + 0.5 * (hash(seed * 13 + d * 17) - 0.5);
    temperature[d] = t;
    humidity[d] = h;
    cloud[d] = Math.min(1, Math.max(0.3, 0.78 + c));
  }
  const out = { temperature, humidity, cloud };
  cache.set(key, out);
  return out;
}

function saturation(t: number): number {
  return 6.112 * Math.exp((17.62 * t) / (243.12 + t));
}

function cosZenith(lat: number, lon: number, utcMs: number): number {
  const date = new Date(utcMs);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = (utcMs - start) / DAY;
  const decl = ((-23.44 * Math.PI) / 180) * Math.cos((2 * Math.PI * (doy + 10)) / 365);
  const solarHour = ((utcMs / HOUR) % 24) + lon / 15;
  const hourAngle = ((solarHour - 12) * 15 * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
}

export interface Hour {
  temperature: number;
  humidity: number;
  wind: number;
  solar: number;
  pressure: number;
}

/**
 * Weather for the hour ending at `utcMs`. `shift` nudges the temperature, for
 * ensemble members.
 */
export function hourAt(lat: number, lon: number, utcMs: number, shift = 0): Hour {
  const a = Math.abs(lat);
  const d = daily(lat, lon);
  const mid = utcMs - HOUR / 2;
  const dayIndex = Math.max(0, Math.min(d.temperature.length - 1, Math.floor((mid - EPOCH) / DAY)));
  const date = new Date(mid);
  const year = date.getUTCFullYear();
  const doy = (mid - Date.UTC(year, 0, 1)) / DAY;
  const peakDoy = lat >= 0 ? 200 : 20;

  const mean = 26.4 - 0.45 * Math.max(0, a - 18);
  const season = 0.8 + 0.35 * Math.max(0, a - 12);
  const range = 7 + 0.12 * Math.max(0, a - 10);
  const warming = 0.026 * (year - 1961 + doy / 365);
  const dailyMean =
    mean + season * Math.cos((2 * Math.PI * (doy - peakDoy)) / 365) + warming + d.temperature[dayIndex]!;
  const solarHour = (((((mid / HOUR) % 24) + lon / 15) % 24) + 24) % 24;
  const temperature = dailyMean + (range / 2) * Math.sin((2 * Math.PI * (solarHour - 9)) / 24) + shift;

  const depression = Math.max(1, 4.8 + 0.18 * Math.max(0, a - 10) + 1.4 * d.humidity[dayIndex]!);
  const dewPoint = Math.min(dailyMean - depression, temperature - 0.3);
  const humidity = Math.max(12, Math.min(100, (100 * saturation(dewPoint)) / saturation(temperature)));

  const wind = Math.max(
    0.3,
    2.2 + 1.3 * Math.sin((2 * Math.PI * (solarHour - 10)) / 24) + 0.8 * gauss(dayIndex * 31 + 7),
  );
  // Mean of the preceding hour, from the sun at the middle of it.
  const cz = cosZenith(lat, lon, mid);
  const solar = cz > 0 ? 1080 * Math.pow(cz, 1.15) * d.cloud[dayIndex]! : 0;
  return { temperature, humidity, wind, solar, pressure: 1010 };
}

export const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;
