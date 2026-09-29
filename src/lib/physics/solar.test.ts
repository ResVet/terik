import { describe, expect, it } from 'vitest';
import spa from './__fixtures__/sun-spa.json';
import { intervalGeometry, referenceSunPosition, sunPosition } from './solar';

const HOUR = 3_600_000;

describe('sunPosition', () => {
  it('matches NREL SPA elevation to within 0.02°', () => {
    let worst = 0;
    for (const [utcMs, lat, lon, elevation] of spa.rows as number[][]) {
      const ours = sunPosition(utcMs!, lat!, lon!).elevation;
      worst = Math.max(worst, Math.abs(ours - elevation!));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('matches NREL SPA azimuth when the sun is well away from the zenith', () => {
    let worst = 0;
    for (const [utcMs, lat, lon, elevation, azimuth] of spa.rows as number[][]) {
      if (elevation! < 2 || elevation! > 80) continue;
      const ours = sunPosition(utcMs!, lat!, lon!).azimuth;
      const d = Math.abs(((ours - azimuth! + 540) % 360) - 180);
      worst = Math.max(worst, d);
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('documents the reference routine being one day ahead in leap years after 2000', () => {
    // 2024-03-20 06:00 UT, day 80. The reference call for the same day lands on the 21st.
    const exact = sunPosition(Date.UTC(2024, 2, 20, 6), 0, 0);
    const reference = referenceSunPosition(2024, 80 + 6 / 24, 0, 0);
    const nextDay = sunPosition(Date.UTC(2024, 2, 21, 6), 0, 0);
    expect(Math.abs(reference.declination - nextDay.declination)).toBeLessThan(1e-9);
    expect(Math.abs(reference.declination - exact.declination)).toBeGreaterThan(0.005);
    // Non-leap years agree.
    const a = sunPosition(Date.UTC(2023, 2, 20, 6), 0, 0);
    const b = referenceSunPosition(2023, 79 + 6 / 24, 0, 0);
    expect(Math.abs(a.declination - b.declination)).toBeLessThan(1e-9);
  });
});

/** Brute-force average of cos z over the sunlit part of an interval. */
function numericGeometry(endMs: number, durationMs: number, lat: number, lon: number) {
  const steps = 3600;
  let sum = 0;
  let lit = 0;
  for (let i = 0; i < steps; i++) {
    const t = endMs - durationMs + ((i + 0.5) / steps) * durationMs;
    const sun = sunPosition(t, lat, lon);
    const cz = Math.sin((sun.elevation * Math.PI) / 180);
    if (cz > 0) {
      sum += cz;
      lit++;
    }
  }
  return { cosZenith: lit ? sum / lit : 0, sunlitFraction: lit / steps };
}

describe('intervalGeometry', () => {
  const places: [string, number, number][] = [
    ['Palembang', -2.99, 104.76],
    ['Reykjavik', 64.15, -21.94],
    ['Phoenix', 33.45, -112.07],
    ['Sydney', -33.87, 151.21],
  ];

  it('agrees with numerical integration across whole days', () => {
    for (const [, lat, lon] of places) {
      for (const day of [Date.UTC(2025, 0, 15), Date.UTC(2025, 5, 21), Date.UTC(2025, 8, 23)]) {
        for (let h = 1; h <= 24; h++) {
          const end = day + h * HOUR;
          const exact = intervalGeometry(end, HOUR, lat, lon);
          const numeric = numericGeometry(end, HOUR, lat, lon);
          expect(Math.abs(exact.sunlitFraction - numeric.sunlitFraction)).toBeLessThan(2e-3);
          if (numeric.sunlitFraction > 0.02) {
            expect(Math.abs(exact.cosZenith - numeric.cosZenith)).toBeLessThan(2e-3);
          }
        }
      }
    }
  });

  it('gives a sunrise hour a real sun angle and a partial daylight fraction', () => {
    // Palembang, 23 Sep 2025: sunrise about 22:55 UT the day before (05:55 local).
    let found = false;
    for (let h = 20; h <= 26; h++) {
      const g = intervalGeometry(Date.UTC(2025, 8, 22) + h * HOUR, HOUR, -2.99, 104.76);
      if (g.sunlitFraction > 0 && g.sunlitFraction < 0.999) {
        found = true;
        expect(g.cosZenith).toBeGreaterThan(0);
        expect(g.cosZenith).toBeLessThan(0.15);
      }
    }
    expect(found).toBe(true);
  });

  it('handles polar night and midnight sun', () => {
    const night = intervalGeometry(Date.UTC(2025, 11, 21, 12), HOUR, 80, 0);
    expect(night.cosZenith).toBe(0);
    expect(night.toaIrradiance).toBe(0);
    const midnightSun = intervalGeometry(Date.UTC(2025, 5, 21, 0), HOUR, 80, 0);
    expect(midnightSun.sunlitFraction).toBe(1);
    expect(midnightSun.cosZenith).toBeGreaterThan(0.1);
  });
});
