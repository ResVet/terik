import { useMemo } from 'react';
import { Link } from 'wouter';
import { dailyMaxima, dayOf365, to365 } from '../../lib/climate/analysis';
import { zonedParts } from '../../lib/time/zone';
import { useClimateData } from '../../data/queries';
import { useFormat, useT } from '../../i18n';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import type { Week } from './model';
import styles from './ClimateContext.module.css';

interface Props {
  week: Week;
  timeZone: string;
  now: number;
}

/** Where each forecast day's peak falls among the same weeks of the last 30 years, if the record is on this device. */
export function ClimateContext({ week, timeZone, now }: Props) {
  const t = useT();
  const f = useFormat();
  const place = useStore((s) => s.place);
  const urban = useStore((s) => s.urban);
  const climate = useClimateData(place, timeZone, urban, false);

  const ranks = useMemo(() => {
    const data = climate.data;
    if (!data) return null;
    const recentStart = data.lastCompleteYear - 29;
    const pools = data.years
      .filter((y) => y.year >= recentStart && y.year <= data.lastCompleteYear)
      .map((y) => to365(dailyMaxima(y), y.year));
    if (pools.length < 20) return null;
    return {
      period: `${recentStart}-${data.lastCompleteYear}`,
      days: week.days.map((d) => {
        const p = zonedParts(d.start + 12 * 3_600_000, timeZone);
        const doy = dayOf365(p.month, p.day);
        let below = 0;
        let total = 0;
        for (const year of pools) {
          for (let k = -7; k <= 7; k++) {
            const v = year[(doy + k + 365) % 365]!;
            if (!Number.isFinite(v)) continue;
            total++;
            if (v < d.peak) below++;
          }
        }
        return { day: d, pct: total ? below / total : Number.NaN };
      }),
    };
  }, [climate.data, week, timeZone]);

  if (!ranks) {
    return (
      <Card id="context" title={t.context.title}>
        <Link href="/climate" className={styles.cta}>
          <Icon name="climate" size={20} />
          <span>{t.context.cta}</span>
          <Icon name="chevronRight" size={18} />
        </Link>
      </Card>
    );
  }

  const top = ranks.days.reduce((a, b) => (b.pct > a.pct ? b : a));
  return (
    <Card id="context" title={t.context.title}>
      {Number.isFinite(top.pct) && (
        <p className={styles.line}>
          {t.context.line(
            f.dayLabel(top.day.start + 12 * 3_600_000, timeZone, now),
            Math.round(top.pct * 100),
            ranks.period,
          )}
        </p>
      )}
      <ul className={styles.strip}>
        {ranks.days.map(({ day, pct }) => (
          <li key={day.key}>
            <span className={styles.bar}>
              <span style={{ height: `${Math.max(4, pct * 100)}%` }} />
            </span>
            <span className={styles.pct}>{Number.isFinite(pct) ? `${Math.round(pct * 100)}` : '-'}</span>
            <span className={styles.day}>{f.weekday(day.start + 12 * 3_600_000, timeZone)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.caption}>{t.context.percentile(ranks.period)}</p>
      <Link href="/climate" className={styles.more}>
        {t.context.cta}
        <Icon name="chevronRight" size={16} />
      </Link>
    </Card>
  );
}
