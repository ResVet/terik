import type { CSSProperties } from 'react';
import { useFormat, useT } from '../../i18n';
import type { Level } from '../../lib/guidance/profiles';
import { useWidth } from '../charts/useSize';
import styles from './Level.module.css';

export const levelColor = (level: number) => `var(--level-${level})`;
export const onLevelColor = (level: number) => `var(--on-level-${level})`;

/** A level always shows its number and name next to the colour. */
export function LevelBadge({ level, size = 'm' }: { level: Level; size?: 's' | 'm' | 'l' }) {
  const t = useT();
  return (
    <span className={`${styles.badge} ${styles[size]}`}>
      <span className={styles.swatch} style={{ background: levelColor(level) }} aria-hidden="true">
        <span style={{ color: onLevelColor(level) }}>{level}</span>
      </span>
      <span className={styles.name}>{t.levels.name[level]}</span>
      <span className="visually-hidden">{`, ${t.levels.level(level)}`}</span>
    </span>
  );
}

interface ScaleProps {
  thresholds: readonly [number, number, number, number];
  value: number;
  /** WBGT range shown, °C. */
  domain?: [number, number];
  compact?: boolean;
}

/**
 * The five levels laid out along the WBGT axis, with the current value
 * marked. Segment widths follow the real thresholds, so a narrow band means
 * a small step in WBGT moves you up a level.
 */
export function LevelScale({ thresholds, value, domain, compact = false }: ScaleProps) {
  const t = useT();
  const f = useFormat();
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const lo = domain?.[0] ?? Math.min(thresholds[0] - 4, Number.isFinite(value) ? value - 1 : Infinity);
  const hi = domain?.[1] ?? Math.max(thresholds[3] + 3, Number.isFinite(value) ? value + 1 : -Infinity);
  const span = hi - lo;
  const share = (v: number) => (Math.min(hi, Math.max(lo, v)) - lo) / span;
  const pos = (v: number) => `${share(v) * 100}%`;
  const edges = [lo, ...thresholds, hi];
  const unique = thresholds.filter((v, i) => i === 0 || v !== thresholds[i - 1]);

  // Tick labels that would touch drop to a second line; a third crowded one is left out.
  const lastInRow = [-Infinity, -Infinity];
  const ticks = unique.flatMap((v) => {
    const x = share(v) * width;
    const row = x - lastInRow[0]! >= 42 ? 0 : x - lastInRow[1]! >= 42 ? 1 : -1;
    if (row < 0) return [];
    lastInRow[row] = x;
    return [{ v, row }];
  });
  const twoRows = ticks.some((tick) => tick.row === 1);

  return (
    <div
      ref={ref}
      className={`${styles.scale} ${compact ? styles.compact : ''} ${twoRows && !compact ? styles.twoRows : ''}`}
      role="img"
      aria-label={`${t.levels.scale}: ${f.temp(value)}`}
    >
      <div className={styles.track}>
        <div className={styles.bar}>
          {edges.slice(0, 5).map((from, i) => {
            const to = edges[i + 1]!;
            if (to <= from) return null;
            const style: CSSProperties = {
              left: pos(from),
              width: `calc(${pos(to)} - ${pos(from)})`,
              background: levelColor(i + 1),
            };
            return <span key={i} className={styles.segment} style={style} />;
          })}
        </div>
        {Number.isFinite(value) && <span className={styles.marker} style={{ left: pos(value) }} />}
      </div>
      {!compact && (
        <div className={styles.ticks} aria-hidden="true">
          {ticks.map(({ v, row }) => (
            <span key={v} className={styles.tick} style={{ left: pos(v), top: row * 14 }}>
              {f.temp(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LevelLegend() {
  const t = useT();
  return (
    <ul className={styles.legend} aria-label={t.levels.scale}>
      {([1, 2, 3, 4, 5] as const).map((l) => (
        <li key={l}>
          <span className={styles.legendSwatch} style={{ background: levelColor(l) }} aria-hidden="true" />
          <span className="tnum">{l}</span>
          <span>{t.levels.name[l]}</span>
        </li>
      ))}
    </ul>
  );
}
