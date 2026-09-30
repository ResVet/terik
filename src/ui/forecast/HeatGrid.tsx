import { useRef, type KeyboardEvent } from 'react';
import { useFormat, useT } from '../../i18n';
import { levelColor } from '../components/Level';
import type { Week } from './model';
import styles from './HeatGrid.module.css';

interface Props {
  week: Week;
  timeZone: string;
  now: number;
  selected: number;
  onSelect: (index: number) => void;
}

/**
 * The week as a 7 x 24 grid of hours. It is the accessible twin of the 3D
 * view: a real grid with arrow-key navigation, one tab stop, and every value
 * reachable without hovering.
 */
export function HeatGrid({ week, timeZone, now, selected, onSelect }: Props) {
  const t = useT();
  const f = useFormat();
  const root = useRef<HTMLDivElement>(null);

  // Map (day, hour) to the index in week.hours.
  const lookup = week.days.map(() => new Array<number>(24).fill(-1));
  week.hours.forEach((h, i) => {
    const row = lookup[h.day];
    if (row) row[h.hour] = i;
  });

  const move = (e: KeyboardEvent, day: number, hour: number) => {
    let d = day;
    let h = hour;
    if (e.key === 'ArrowRight') h++;
    else if (e.key === 'ArrowLeft') h--;
    else if (e.key === 'ArrowDown') d++;
    else if (e.key === 'ArrowUp') d--;
    else if (e.key === 'Home') h = 0;
    else if (e.key === 'End') h = 23;
    else return;
    e.preventDefault();
    if (h > 23 && d < week.days.length - 1) {
      h = 0;
      d++;
    }
    if (h < 0 && d > 0) {
      h = 23;
      d--;
    }
    d = Math.max(0, Math.min(week.days.length - 1, d));
    h = Math.max(0, Math.min(23, h));
    const index = lookup[d]?.[h] ?? -1;
    if (index >= 0) {
      onSelect(index);
      root.current?.querySelector<HTMLElement>(`[data-cell="${d}-${h}"]`)?.focus();
    }
  };

  return (
    <div className={styles.wrap}>
      <div
        ref={root}
        className={styles.grid}
        role="grid"
        aria-label={t.heatscape.title}
        aria-rowcount={week.days.length + 1}
        aria-colcount={25}
      >
        <div role="row" className={styles.row} aria-rowindex={1}>
          <span role="columnheader" className={styles.corner} aria-colindex={1}>
            <span className="visually-hidden">{t.heatscape.days}</span>
          </span>
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} role="columnheader" className={styles.hourHead} aria-colindex={h + 2}>
              <span className={h % 3 === 0 ? undefined : styles.minor}>{String(h).padStart(2, '0')}</span>
            </span>
          ))}
        </div>
        {week.days.map((day, d) => (
          <div role="row" key={day.key} className={styles.row} aria-rowindex={d + 2}>
            <span role="rowheader" className={styles.dayHead} aria-colindex={1}>
              <span className={styles.dayName}>{f.weekday(day.start + 12 * 3_600_000, timeZone)}</span>
              <span className={styles.dayDate}>{f.date(day.start + 12 * 3_600_000, timeZone)}</span>
            </span>
            {Array.from({ length: 24 }, (_, h) => {
              const index = lookup[d]![h]!;
              const hour = index >= 0 ? week.hours[index] : undefined;
              const isSelected = index === selected;
              const isPast = hour ? hour.time < now - 3_600_000 : false;
              const label = hour
                ? `${f.dayLabel(hour.time, timeZone, now)} ${f.time(hour.time, timeZone)}: WBGT ${f.temp(hour.wbgt)}, ${t.levels.level(hour.level)} ${t.levels.name[hour.level]}`
                : '';
              return (
                <span
                  key={h}
                  role="gridcell"
                  aria-colindex={h + 2}
                  aria-selected={isSelected}
                  aria-label={label}
                  data-cell={`${d}-${h}`}
                  tabIndex={isSelected ? 0 : -1}
                  className={`${styles.cell} ${isPast ? styles.past : ''} ${isSelected ? styles.selected : ''}`}
                  style={{ background: hour && Number.isFinite(hour.wbgt) ? levelColor(hour.level) : undefined }}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse' && index >= 0) onSelect(index);
                  }}
                  onClick={() => index >= 0 && onSelect(index)}
                  onKeyDown={(e) => move(e, d, h)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
