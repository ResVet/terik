import { useMemo } from 'react';
import type { ClimateData } from '../../data/climate';
import { useFormat, useT } from '../../i18n';
import type { ClimateAnalysis } from '../../lib/climate/analysis';
import { annualCsv, dailyCsv } from '../../lib/climate/csv';
import type { ProfileSettings } from '../../lib/guidance/profiles';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { downloadText, slug } from '../download';
import styles from './YearTable.module.css';

interface Props {
  analysis: ClimateAnalysis;
  data: ClimateData;
  placeName: string;
  settings: ProfileSettings;
}

/** Every year's figures as a real table, newest first, with CSV downloads. */
export function YearTable({ analysis, data, placeName, settings }: Props) {
  const t = useT();
  const f = useFormat();
  const { baseline, recent } = analysis;
  const rows = useMemo(
    () =>
      analysis.years
        .map((year, i) => ({
          year,
          hot: analysis.hotDays[i]!,
          lost: analysis.lostHours[i]!,
          mean: analysis.meanDailyMax[i]!,
          max: analysis.annualMax[i]!,
        }))
        .reverse(),
    [analysis],
  );
  const base = `${baseline.start}-${baseline.end}`;
  const now = `${recent.start}-${recent.end}`;
  const file = `terik-${slug(placeName)}`;

  return (
    <Card id="years" title={t.climate.tableTitle} subtitle={t.climate.tableNote(base, now)}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          <Icon name="chevronRight" size={16} className={styles.chevron} />
          {t.climate.tableSummary(rows.length)}
        </summary>
        <div className={styles.scroll} role="region" aria-label={t.climate.tableTitle} tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t.climate.colYear}</th>
                <th scope="col">{t.climate.colHot}</th>
                <th scope="col">{t.climate.colLost}</th>
                <th scope="col">{t.climate.colMean}</th>
                <th scope="col">{t.climate.colMax}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const period =
                  r.year >= recent.start && r.year <= recent.end
                    ? styles.recent
                    : r.year >= baseline.start && r.year <= baseline.end
                      ? styles.baseline
                      : undefined;
                return (
                  <tr key={r.year} className={period}>
                    <th scope="row">{r.year}</th>
                    <td>{f.number(r.hot, 0)}</td>
                    <td>{f.number(r.lost, 0)}</td>
                    <td>{f.temp(r.mean)}</td>
                    <td>{f.temp(r.max)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <div className={styles.downloads}>
        <button
          type="button"
          className={styles.download}
          onClick={() =>
            downloadText(
              `${file}-yearly-${settings.profile}-level${analysis.minLevel}.csv`,
              annualCsv(analysis),
              'text/csv',
            )
          }
        >
          <Icon name="download" size={16} />
          {t.climate.csvAnnual}
        </button>
        <button
          type="button"
          className={styles.download}
          onClick={() => downloadText(`${file}-daily-peak-wbgt.csv`, dailyCsv(data.years), 'text/csv')}
        >
          <Icon name="download" size={16} />
          {t.climate.csvDaily}
        </button>
      </div>
    </Card>
  );
}
