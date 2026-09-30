const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

/** Position on a 0-12 month scale of a day (0-365) in a 365-day year. */
export function monthPosition(day: number): number {
  const d = Math.max(0, Math.min(365, day));
  let m = 0;
  while (m < 11 && d >= MONTH_STARTS[m + 1]!) m++;
  return m + (d - MONTH_STARTS[m]!) / (MONTH_STARTS[m + 1]! - MONTH_STARTS[m]!);
}

/** Month position of the centre of column `col` when the year is split into `cols` equal steps. */
export function columnMonth(col: number, cols: number): number {
  return monthPosition(((col + 0.5) / cols) * 365);
}

/** Middle day (0-364) of each month, for placing month labels. */
export const MONTH_MIDDLES = MONTH_STARTS.slice(0, 12).map((start, m) => (start + MONTH_STARTS[m + 1]!) / 2);
