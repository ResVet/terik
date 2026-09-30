import { describe, expect, it } from 'vitest';
import { hoursInYear, type ClimateAnalysis, type ClimateYear } from './analysis';
import { annualCsv, dailyCsv } from './csv';

describe('CSV export', () => {
  it('writes one row per year with fixed decimals and blanks for gaps', () => {
    const analysis = {
      years: [1961, 1962],
      hotDays: [3, 4.25],
      lostHours: [10.04, Number.NaN],
      meanDailyMax: [28.123, 28.5],
      annualMax: [31, 31.456],
    } as unknown as ClimateAnalysis;
    expect(annualCsv(analysis)).toBe(
      'year,hot_days,hours_lost,mean_daily_peak_wbgt_c,annual_max_wbgt_c\n' +
        '1961,3.0,10.0,28.12,31.00\n' +
        '1962,4.3,,28.50,31.46\n',
    );
  });

  it('keeps 29 February and stops at the last day with data', () => {
    const leap: ClimateYear = { year: 2024, wbgt: new Float32Array(hoursInYear(2024)).fill(Number.NaN) };
    // Data for 28 Feb to 1 Mar only (days 58 to 60).
    leap.wbgt.fill(25, 58 * 24, 61 * 24);
    leap.wbgt[59 * 24 + 13] = 30.5;
    const lines = dailyCsv([leap]).trim().split('\n');
    expect(lines[0]).toBe('date,peak_wbgt_c');
    expect(lines).toHaveLength(1 + 61);
    expect(lines[1]).toBe('2024-01-01,');
    expect(lines[59]).toBe('2024-02-28,25.00');
    expect(lines[60]).toBe('2024-02-29,30.50');
    expect(lines[61]).toBe('2024-03-01,25.00');
  });
});
