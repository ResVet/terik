import { useState } from 'react';
import { useFormat, useT } from '../../i18n';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { levelColor, onLevelColor } from '../components/Level';
import { workRestLabel } from './advice';
import type { Week } from './model';
import styles from './HourTable.module.css';

interface Props {
  week: Week;
  timeZone: string;
  now: number;
  selected: number;
  onSelect: (index: number) => void;
}

export function HourTable({ week, timeZone, now, selected, onSelect }: Props) {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const selectedDay = week.hours[selected]?.day ?? 0;
  const [day, setDay] = useState(selectedDay);

  // Follow the day picked in the 3D view or the grid (adjusted while rendering, not in an effect).
  const [followed, setFollowed] = useState(selectedDay);
  if (followed !== selectedDay) {
    setFollowed(selectedDay);
    setDay(selectedDay);
  }

  const current = week.days[day];

  return (
    <Card id="hours" title={t.table.title}>
      <div className={styles.tabs} role="tablist" aria-label={t.heatscape.days}>
        {week.days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            id={`tab-${d.key}`}
            aria-selected={i === day}
            aria-controls="hours-panel"
            tabIndex={i === day ? 0 : -1}
            className={styles.tab}
            onClick={() => setDay(i)}
            onKeyDown={(e) => {
              const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
              if (next !== null && next >= 0 && next < week.days.length) {
                e.preventDefault();
                setDay(next);
                (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
              }
            }}
          >
            <span className={styles.tabDay}>
              {i === 0 ? t.common.today : f.weekday(d.start + 12 * 3_600_000, timeZone)}
            </span>
            <span className={styles.tabPeak}>
              <span className={styles.tabSwatch} style={{ background: levelColor(d.peakLevel) }} aria-hidden="true" />
              {Number.isFinite(d.peak) ? f.temp(d.peak) : '-'}
            </span>
          </button>
        ))}
      </div>

      {current && (
        <div
          id="hours-panel"
          role="tabpanel"
          aria-labelledby={`tab-${current.key}`}
          className={styles.scroller}
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t.table.time}</th>
                <th scope="col">{t.table.wbgt}</th>
                <th scope="col">{t.table.level}</th>
                <th scope="col">
                  {settings.profile === 'sport' || settings.profile === 'football' ? t.levels.scale : t.table.work}
                </th>
                <th scope="col">{t.table.shade}</th>
                <th scope="col">{t.table.air}</th>
                <th scope="col">{t.table.humidity}</th>
                <th scope="col">{t.table.wind}</th>
                <th scope="col">{t.table.sun}</th>
              </tr>
            </thead>
            <tbody>
              {current.hours.map((h) => {
                const index = week.hours.indexOf(h);
                const past = h.time < now - 3_600_000;
                return (
                  <tr
                    key={h.time}
                    className={`${past ? styles.past : ''} ${index === selected ? styles.selected : ''}`}
                    onClick={() => onSelect(index)}
                  >
                    <th scope="row">{f.time(h.time, timeZone)}</th>
                    <td className={styles.strong}>{f.temp(h.wbgt)}</td>
                    <td>
                      <span
                        className={styles.levelChip}
                        style={{ background: levelColor(h.level), color: onLevelColor(h.level) }}
                      >
                        {h.level}
                      </span>
                      <span className="visually-hidden">{t.levels.name[h.level]}</span>
                    </td>
                    <td>{workRestLabel(t, settings.profile, h.level, h.workMinutes)}</td>
                    <td>{f.temp(h.shade)}</td>
                    <td>{f.temp(h.air)}</td>
                    <td>{f.integer(h.humidity)}%</td>
                    <td>{f.number(h.wind, 1)}</td>
                    <td>{h.solar > 1 ? f.integer(h.solar) : '0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.units}>
        WBGT, {t.table.shade.toLowerCase()}, {t.table.air.toLowerCase()}: {f.unitSymbol} · {t.table.wind}: m/s ·{' '}
        {t.table.sun}: W/m²
      </p>
    </Card>
  );
}
