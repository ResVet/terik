import { describe, expect, it } from 'vitest';
import reference from './__fixtures__/liljegren-reference.json';
import { calcWbgtReference, computeWbgt, psychrometricWetBulb, type ReferenceInput } from './liljegren';
import { instantGeometry } from './solar';

type Row = number[];

function toInput(row: Row): ReferenceInput {
  const [
    year,
    dayOfYear,
    hour,
    minute,
    gmtOffset,
    averagingMinutes,
    latitude,
    longitude,
    solar,
    pressure,
    airTemperature,
    relativeHumidity,
    windSpeed,
    windHeight,
    deltaT,
    urban,
  ] = row as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    year,
    dayOfYear,
    hour,
    minute,
    gmtOffset,
    averagingMinutes,
    latitude,
    longitude,
    solar,
    pressure,
    airTemperature,
    relativeHumidity,
    windSpeed,
    windHeight,
    deltaT,
    urban: urban === 1,
  };
}

const cases = reference.cases as Row[];

describe('Liljegren port against the original C program (double build)', () => {
  it('reproduces every converged case to 1e-6 °C and fails where the C code fails', () => {
    let worst = 0;
    let compared = 0;
    for (const row of cases) {
      const input = toInput(row);
      const [status, wind2m, globe, tnwb, tpsy, wbgt] = row.slice(16) as number[];
      const result = calcWbgtReference(input);
      expect(result.status, `status for ${row.join(' ')}`).toBe(status);
      if (status !== 0) continue;
      for (const [ours, theirs] of [
        [result.wbgt, wbgt],
        [result.globe, globe],
        [result.naturalWetBulb, tnwb],
        [result.psychrometricWetBulb, tpsy],
        [result.wind2m, wind2m],
      ] as [number, number][]) {
        worst = Math.max(worst, Math.abs(ours - theirs));
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(2900);
    expect(worst).toBeLessThan(1e-6);
  });
});

describe('computeWbgt', () => {
  it('agrees with the reference for instantaneous inputs within the solver tolerance', () => {
    let worst = 0;
    for (const row of cases) {
      const input = toInput(row);
      const status = row[16];
      if (status !== 0 || input.averagingMinutes !== 0) continue;
      const ref = calcWbgtReference(input);
      // Same instant in UTC as the reference evaluates.
      const utcHours = input.hour - input.gmtOffset + input.minute / 60;
      const utcMs = Date.UTC(input.year, 0, input.dayOfYear, 0, 0, 0) + utcHours * 3_600_000;
      const geometry = instantGeometry(utcMs, input.latitude, input.longitude);
      const leapAfter2000 = input.year > 2000 && input.year % 4 === 0;
      const result = computeWbgt({
        airTemperature: input.airTemperature,
        relativeHumidity: input.relativeHumidity,
        pressure: input.pressure,
        windSpeed: input.windSpeed,
        windHeight: input.windHeight,
        solar: input.solar,
        cosZenith: geometry.cosZenith,
        toaIrradiance: geometry.toaIrradiance,
        urban: input.urban,
        deltaT: input.deltaT,
      });
      // The reference sun is a day off in leap years after 2000, so those
      // dates are only checked loosely.
      const diff = Math.abs(result.wbgt - ref.wbgt);
      if (leapAfter2000) {
        expect(diff).toBeLessThan(0.5);
      } else {
        worst = Math.max(worst, diff);
      }
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('still returns a value where the fixed-point iteration stalls in hot conditions', () => {
    const hotFailures = cases.filter((row) => row[16] !== 0 && (row[10] as number) > 15);
    expect(hotFailures.length).toBeGreaterThan(0);
    for (const row of hotFailures) {
      const input = toInput(row);
      const result = computeWbgt({
        airTemperature: input.airTemperature,
        relativeHumidity: input.relativeHumidity,
        pressure: input.pressure,
        windSpeed: input.windSpeed,
        windHeight: input.windHeight,
        solar: input.solar,
        cosZenith: 0.9,
        toaIrradiance: 1200,
        urban: input.urban,
        deltaT: input.deltaT,
      });
      expect(Number.isFinite(result.wbgt)).toBe(true);
      expect(result.globe).toBeGreaterThan(input.airTemperature - 5);
    }
  });

  const tropicalNoon = {
    airTemperature: 33,
    relativeHumidity: 60,
    pressure: 1008,
    windSpeed: 2.5,
    windHeight: 10,
    solar: 850,
    cosZenith: 0.95,
    toaIrradiance: 1290,
  };

  it('gives a plausible tropical midday value', () => {
    const r = computeWbgt(tropicalNoon);
    expect(r.wbgt).toBeGreaterThan(30);
    expect(r.wbgt).toBeLessThan(35);
    expect(r.globe).toBeGreaterThan(tropicalNoon.airTemperature + 8);
    expect(r.naturalWetBulb).toBeLessThan(tropicalNoon.airTemperature);
  });

  it('rises with sunshine and humidity and falls with wind', () => {
    const base = computeWbgt(tropicalNoon).wbgt;
    expect(computeWbgt({ ...tropicalNoon, solar: 400 }).wbgt).toBeLessThan(base);
    expect(computeWbgt({ ...tropicalNoon, relativeHumidity: 80 }).wbgt).toBeGreaterThan(base);
    expect(computeWbgt({ ...tropicalNoon, windSpeed: 7 }).wbgt).toBeLessThan(base);
  });

  it('drops by several degrees in shade', () => {
    const sun = computeWbgt(tropicalNoon).wbgt;
    const shade = computeWbgt({ ...tropicalNoon, solar: 0 }).wbgt;
    expect(sun - shade).toBeGreaterThan(2);
    expect(sun - shade).toBeLessThan(7);
  });

  it('treats a built-up site as more sheltered than open ground', () => {
    const urban = computeWbgt({ ...tropicalNoon, urban: true }).wbgt;
    const rural = computeWbgt({ ...tropicalNoon, urban: false }).wbgt;
    expect(urban).toBeGreaterThan(rural);
  });

  it('returns NaN rather than a number when an input is missing', () => {
    expect(Number.isNaN(computeWbgt({ ...tropicalNoon, relativeHumidity: Number.NaN }).wbgt)).toBe(true);
  });

  it('computes a psychrometric wet bulb close to the textbook value', () => {
    // 30 °C, 50 %, sea level: about 22.0 °C (psychrometric tables).
    const t = psychrometricWetBulb(30, 50, 1013.25);
    expect(t).toBeGreaterThan(21.5);
    expect(t).toBeLessThan(22.5);
  });
});
