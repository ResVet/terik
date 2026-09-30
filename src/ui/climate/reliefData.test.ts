import { describe, expect, it } from 'vitest';
import { hoursInYear, type ClimateYear } from '../../lib/climate/analysis';
import { BINS, binDays, binnedPeaks, hottestCell, yearGrid } from './reliefData';

function flatYear(year: number, value: number): ClimateYear {
  return { year, wbgt: new Float32Array(hoursInYear(year)).fill(value) };
}

describe('relief data', () => {
  it('splits the 365-day year into 73 five-day steps', () => {
    expect(BINS).toBe(73);
    expect(binDays(0)).toEqual([0, 4]);
    expect(binDays(72)).toEqual([360, 364]);
  });

  it('averages the daily peaks in each step and needs three days of data', () => {
    const y = flatYear(2001, 20);
    // Day 2 peaks at 30: the first step averages (20 + 20 + 30 + 20 + 20) / 5.
    y.wbgt[2 * 24 + 14] = 30;
    // Only two days with data in the second step.
    y.wbgt.fill(Number.NaN, 5 * 24, 8 * 24);
    const row = binnedPeaks(y);
    expect(row[0]).toBeCloseTo(22, 5);
    expect(row[1]).toBeNaN();
    expect(row[2]).toBe(20);
  });

  it('puts each year on its own row and leaves missing years empty', () => {
    const grid = yearGrid([flatYear(1963, 25), flatYear(1961, 21)], 1961, 1964);
    expect(grid.rows).toBe(4);
    expect(grid.cols).toBe(BINS);
    expect(grid.years).toEqual([1961, 1962, 1963, 1964]);
    expect(grid.values[0]).toBe(21);
    expect(grid.values[BINS]).toBeNaN();
    expect(grid.values[2 * BINS + 10]).toBe(25);
    expect(hottestCell(grid)).toEqual({ row: 2, col: 0 });
    expect(hottestCell(yearGrid([], 1961, 1962))).toBeNull();
  });
});
