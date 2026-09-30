import { dailyMaxima, type ClimateAnalysis, type ClimateYear } from './analysis';

const cell = (v: number, digits: number) => (Number.isFinite(v) ? v.toFixed(digits) : '');

/** One line per complete year with the figures on the climate page (°C). */
export function annualCsv(analysis: ClimateAnalysis): string {
  const lines = ['year,hot_days,hours_lost,mean_daily_peak_wbgt_c,annual_max_wbgt_c'];
  analysis.years.forEach((year, i) => {
    lines.push(
      [
        year,
        cell(analysis.hotDays[i]!, 1),
        cell(analysis.lostHours[i]!, 1),
        cell(analysis.meanDailyMax[i]!, 2),
        cell(analysis.annualMax[i]!, 2),
      ].join(','),
    );
  });
  return `${lines.join('\n')}\n`;
}

/**
 * Every day's peak WBGT (°C) on the real calendar, 29 February included.
 * Days without enough hours are left blank; a year's trailing blanks (the
 * rest of the current year) are left out.
 */
export function dailyCsv(years: readonly ClimateYear[]): string {
  const lines = ['date,peak_wbgt_c'];
  for (const block of [...years].sort((a, b) => a.year - b.year)) {
    const daily = dailyMaxima(block);
    let last = daily.length - 1;
    while (last >= 0 && !Number.isFinite(daily[last]!)) last--;
    for (let d = 0; d <= last; d++) {
      const date = new Date(Date.UTC(block.year, 0, 1 + d)).toISOString().slice(0, 10);
      lines.push(`${date},${cell(daily[d]!, 2)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
