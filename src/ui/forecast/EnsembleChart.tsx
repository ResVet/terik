import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useMemo, useState, type PointerEvent } from 'react';
import { useFormat, useT } from '../../i18n';
import { Card } from '../components/Card';
import { levelColor } from '../components/Level';
import { useWidth } from '../charts/useSize';
import type { Hour, Week } from './model';
import styles from './EnsembleChart.module.css';

interface Props {
  week: Week;
  timeZone: string;
  now: number;
  status: 'loading' | 'ready' | 'error';
}

const M = { top: 12, right: 44, bottom: 30, left: 34 };

export function EnsembleChart({ week, timeZone, now, status }: Props) {
  const t = useT();
  const f = useFormat();
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 560 ? 240 : 300;
  const [hover, setHover] = useState<number | null>(null);

  const hours = week.hours;
  const hasBand = status === 'ready' && hours.some((h) => Number.isFinite(h.p10));
  const start = hours[0]?.time ?? now;
  const end = hours.at(-1)?.time ?? now + 1;

  const { x, y, yTicks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of hours) {
      for (const v of [h.wbgt, h.p10, h.p90]) {
        if (Number.isFinite(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    if (!Number.isFinite(lo)) {
      lo = 20;
      hi = 32;
    }
    const pad = Math.max(0.8, (hi - lo) * 0.08);
    const yScale = scaleLinear()
      .domain([Math.floor(lo - pad), Math.ceil(hi + pad)])
      .range([height - M.bottom, M.top]);
    const xScale = scaleLinear()
      .domain([start, end])
      .range([M.left, Math.max(M.left + 10, width - M.right)]);
    return { x: xScale, y: yScale, yTicks: yScale.ticks(width < 560 ? 4 : 6) };
  }, [hours, height, width, start, end]);

  const forecastPath = useMemo(
    () =>
      line<Hour>()
        .defined((h) => Number.isFinite(h.wbgt))
        .x((h) => x(h.time))
        .y((h) => y(h.wbgt))
        .curve(curveMonotoneX)(hours) ?? '',
    [hours, x, y],
  );
  const bandPath = useMemo(
    () =>
      hasBand
        ? (area<Hour>()
            .defined((h) => Number.isFinite(h.p10) && Number.isFinite(h.p90))
            .x((h) => x(h.time))
            .y0((h) => y(h.p10))
            .y1((h) => y(h.p90))
            .curve(curveMonotoneX)(hours) ?? '')
        : '',
    [hours, x, y, hasBand],
  );
  const medianPath = useMemo(
    () =>
      hasBand
        ? (line<Hour>()
            .defined((h) => Number.isFinite(h.p50))
            .x((h) => x(h.time))
            .y((h) => y(h.p50))
            .curve(curveMonotoneX)(hours) ?? '')
        : '',
    [hours, x, y, hasBand],
  );

  const [domainLo, domainHi] = y.domain() as [number, number];
  const bands = [domainLo, ...week.thresholds, domainHi].map((v) => Math.min(domainHi, Math.max(domainLo, v)));
  const uniqueThresholds = week.thresholds
    .map((v, i) => ({ v, level: i + 2 }))
    .filter((d, i, all) => (i === 0 || d.v !== all[i - 1]!.v) && d.v > domainLo && d.v < domainHi);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + M.left;
    const time = x.invert(px);
    let best = 0;
    for (let i = 0; i < hours.length; i++) {
      if (Math.abs(hours[i]!.time - time) < Math.abs(hours[best]!.time - time)) best = i;
    }
    setHover(best);
  };

  const active = hover !== null ? hours[hover] : undefined;
  const nextLevel = active && active.level < 5 ? ((active.level + 1) as 2 | 3 | 4 | 5) : null;

  return (
    <Card
      id="ensemble"
      title={t.ensemble.title}
      subtitle={
        status === 'ready' && week.members
          ? t.ensemble.subtitle(week.members)
          : status === 'loading'
            ? t.ensemble.loading
            : t.ensemble.unavailable
      }
    >
      <ul className={styles.legend}>
        <li>
          <span className={styles.keyLine} aria-hidden="true" />
          {t.ensemble.forecast}
        </li>
        {hasBand && (
          <>
            <li>
              <span className={styles.keyBand} aria-hidden="true" />
              {t.ensemble.band}
            </li>
            <li>
              <span className={styles.keyMedian} aria-hidden="true" />
              {t.ensemble.median}
            </li>
          </>
        )}
      </ul>
      <div ref={ref} className={`${styles.chart} ${status === 'loading' ? styles.loading : ''}`}>
        <svg width={width} height={height} role="img" aria-label={t.ensemble.title}>
          {/* Level zones as a narrow rail on the right edge */}
          {bands.slice(0, 5).map((from, i) => {
            const to = bands[i + 1]!;
            if (to <= from) return null;
            return (
              <rect
                key={i}
                x={width - M.right + 6}
                width={4}
                y={y(to)}
                height={Math.max(0, y(from) - y(to))}
                fill={levelColor(i + 1)}
                rx={1}
              />
            );
          })}

          {/* Night shading */}
          {hours.map((h, i) =>
            h.solar <= 0 && i < hours.length - 1 ? (
              <rect
                key={`n${h.time}`}
                x={x(h.time)}
                width={Math.max(0, x(hours[i + 1]!.time) - x(h.time))}
                y={M.top}
                height={height - M.top - M.bottom}
                className={styles.night}
              />
            ) : null,
          )}

          {yTicks.map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - M.right} className={styles.grid} />
              <text x={M.left - 8} dy="0.32em" textAnchor="end" className={styles.tick}>
                {f.temp(v, 0)}
              </text>
            </g>
          ))}

          {week.days.map((d, i) =>
            i === 0 ? null : (
              <line
                key={d.key}
                x1={x(d.start)}
                x2={x(d.start)}
                y1={M.top}
                y2={height - M.bottom}
                className={styles.midnight}
              />
            ),
          )}
          {week.days.map((d) => {
            const mid = d.start + 12 * 3_600_000;
            if (mid < start || mid > end) return null;
            return (
              <text key={`l${d.key}`} x={x(mid)} y={height - 10} textAnchor="middle" className={styles.day}>
                {f.weekday(mid, timeZone)}
              </text>
            );
          })}

          {uniqueThresholds.map(({ v, level }) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={styles.threshold} />
              <text x={width - M.right + 14} y={y(v)} dy="0.32em" className={styles.thresholdLabel}>
                {level}
              </text>
            </g>
          ))}

          {bandPath && <path d={bandPath} className={styles.band} />}
          {medianPath && <path d={medianPath} className={styles.median} />}
          <path d={forecastPath} className={styles.forecast} />

          {now >= start && now <= end && (
            <g>
              <line x1={x(now)} x2={x(now)} y1={M.top} y2={height - M.bottom} className={styles.now} />
            </g>
          )}

          {active && Number.isFinite(active.wbgt) && (
            <g>
              <line
                x1={x(active.time)}
                x2={x(active.time)}
                y1={M.top}
                y2={height - M.bottom}
                className={styles.crosshair}
              />
              <circle cx={x(active.time)} cy={y(active.wbgt)} r={4.5} className={styles.dot} />
            </g>
          )}

          <rect
            x={M.left}
            y={M.top}
            width={Math.max(0, width - M.left - M.right)}
            height={height - M.top - M.bottom}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setHover(null);
            }}
          />
        </svg>

        {active && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(Math.max(x(active.time), 90), width - 90),
            }}
            role="status"
          >
            <p className={styles.tipTime}>
              {f.dayLabel(active.time, timeZone, now)} {f.time(active.time, timeZone)}
            </p>
            <p className={styles.tipValue}>{f.temp(active.wbgt)}</p>
            {Number.isFinite(active.p10) && (
              <p className={styles.tipRow}>{t.planner.range(f.temp(active.p10), f.temp(active.p90))}</p>
            )}
            {nextLevel && Number.isFinite(active.worseChance) && (
              <p className={styles.tipRow}>
                {t.ensemble.chance(Math.round(active.worseChance * 100), t.levels.name[nextLevel])}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
