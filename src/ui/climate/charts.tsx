import { scaleBand, scaleLinear, scaleLog } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import type { ClimateAnalysis } from '../../lib/climate/analysis';
import { useFormat, useT } from '../../i18n';
import { levelColor } from '../components/Level';
import { useWidth } from '../charts/useSize';
import styles from './charts.module.css';

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function monthNames(locale: string, style: 'short' | 'narrow' = 'short'): string[] {
  const f = new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, m) => f.format(Date.UTC(2001, m, 15)));
}

function dayLabel(locale: string, day: number): string {
  const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return f.format(Date.UTC(2001, 0, 1 + day));
}

function Legend({ items }: { items: { key: ReactNode; label: string }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((it) => (
        <li key={it.label}>
          {it.key}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A small line of one value per year for the stat tiles. The recent period
 * is drawn in ink, earlier years muted; `reference` adds a dashed level line.
 */
export function Sparkline({
  values,
  years,
  highlightFrom,
  reference,
}: {
  values: number[];
  years: number[];
  highlightFrom: number;
  reference?: number | undefined;
}) {
  const w = 120;
  const h = 32;
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const withReference = reference !== undefined && Number.isFinite(reference) ? [...finite, reference] : finite;
  const lo = Math.min(...withReference);
  const hi = Math.max(...withReference);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 4);
  const split = years.findIndex((yr) => yr >= highlightFrom);
  const path = (from: number, to: number) =>
    values
      .slice(from, to)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
  return (
    <svg className={styles.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {reference !== undefined && Number.isFinite(reference) && (
        <line x1={0} x2={w} y1={y(reference)} y2={y(reference)} className={styles.sparkRef} />
      )}
      <path d={path(0, split > 0 ? split + 1 : values.length)} className={styles.sparkOld} />
      {split > 0 && <path d={path(split, values.length)} className={styles.sparkNew} />}
    </svg>
  );
}

interface ChartProps {
  analysis: ClimateAnalysis;
}

/** Hot days per year as bars, with the Theil-Sen trend line. */
export function HotDaysChart({ analysis }: ChartProps) {
  const t = useT();
  const f = useFormat();
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 240;
  const M = { top: 16, right: 12, bottom: 28, left: 36 };
  const [hover, setHover] = useState<number | null>(null);
  const { years, hotDays, trends, baseline, recent } = analysis;

  const x = useMemo(
    () =>
      scaleBand<number>()
        .domain(years)
        .range([M.left, width - M.right])
        .paddingInner(0.18),
    [years, width, M.left, M.right],
  );
  const maxDays = Math.max(10, ...hotDays.filter(Number.isFinite));
  const y = useMemo(
    () =>
      scaleLinear()
        .domain([0, maxDays])
        .nice()
        .range([height - M.bottom, M.top]),
    [maxDays, M.bottom, M.top],
  );
  const trend = trends.hotDays;
  const bw = Math.min(24, x.bandwidth());
  const tickYears = years.filter((yr) => yr % 10 === 0);

  return (
    <div className={styles.chartBlock}>
      <Legend
        items={[
          { key: <span className={styles.keyBar} aria-hidden="true" />, label: t.climate.chartHot },
          { key: <span className={styles.keyLine} aria-hidden="true" />, label: 'Theil-Sen' },
        ]}
      />
      <div ref={ref} className={styles.chart}>
        <svg width={width} height={height} role="img" aria-label={t.climate.chartHot}>
          {[baseline, recent].map((p) => {
            const x0 = x(p.start);
            const x1 = x(p.end);
            if (x0 === undefined || x1 === undefined) return null;
            return (
              <rect
                key={p.start}
                x={x0 - 1}
                width={x1 + x.bandwidth() - x0 + 2}
                y={M.top}
                height={height - M.top - M.bottom}
                className={styles.period}
              />
            );
          })}
          {y.ticks(4).map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - M.right} className={styles.grid} />
              <text x={M.left - 6} dy="0.32em" textAnchor="end" className={styles.tick}>
                {f.integer(v)}
              </text>
            </g>
          ))}
          {years.map((yr, i) => {
            const v = hotDays[i]!;
            const bx = x(yr)! + (x.bandwidth() - bw) / 2;
            const top = y(Math.max(0, v));
            return (
              <g
                key={yr}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
              >
                <rect x={x(yr)} width={x.bandwidth()} y={M.top} height={height - M.top - M.bottom} fill="transparent" />
                <path
                  d={`M${bx},${height - M.bottom}V${top + Math.min(2, (height - M.bottom - top) / 2)}q0,-2 2,-2h${Math.max(0, bw - 4)}q2,0 2,2V${height - M.bottom}Z`}
                  className={hover === i ? styles.barActive : styles.bar}
                />
              </g>
            );
          })}
          {Number.isFinite(trend.slope) && (
            <line
              x1={x(years[0]!)! + x.bandwidth() / 2}
              x2={x(years.at(-1)!)! + x.bandwidth() / 2}
              y1={y(trend.intercept)}
              y2={y(trend.intercept + trend.slope * (years.at(-1)! - years[0]!))}
              className={styles.trend}
            />
          )}
          <line
            x1={M.left}
            x2={width - M.right}
            y1={height - M.bottom}
            y2={height - M.bottom}
            className={styles.axis}
          />
          {tickYears.map((yr) => (
            <text key={yr} x={x(yr)! + x.bandwidth() / 2} y={height - 8} textAnchor="middle" className={styles.tick}>
              {yr}
            </text>
          ))}
        </svg>
        {hover !== null && (
          <div
            className={styles.tooltip}
            style={{ left: Math.min(Math.max(x(years[hover]!)! + x.bandwidth() / 2, 70), width - 70) }}
          >
            <p className={styles.tipValue}>{f.integer(hotDays[hover]!)}</p>
            <p className={styles.tipLabel}>
              {t.climate.colHot} · {years[hover]}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Daily peak through the year for the two periods, plus the current year so far. */
export function SeasonChart({ analysis, thresholds }: ChartProps & { thresholds: readonly number[] }) {
  const t = useT();
  const f = useFormat();
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 560 ? 260 : 300;
  const M = { top: 12, right: 30, bottom: 28, left: 34 };
  const [hover, setHover] = useState<number | null>(null);
  const { seasonal, current, baseline, recent } = analysis;
  const months = monthNames(f.locale, width < 480 ? 'narrow' : 'short');

  const { y, yTicks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const band of [seasonal.baseline, seasonal.recent]) {
      for (let d = 0; d < 365; d++) {
        lo = Math.min(lo, band.p10[d]!);
        hi = Math.max(hi, band.p90[d]!);
      }
    }
    if (current) for (const v of current.daily) if (Number.isFinite(v)) hi = Math.max(hi, v);
    const scale = scaleLinear()
      .domain([Math.floor(lo - 0.5), Math.ceil(hi + 0.5)])
      .range([height - M.bottom, M.top]);
    return { y: scale, yTicks: scale.ticks(5) };
  }, [seasonal, current, height, M.bottom, M.top]);
  const x = useMemo(
    () =>
      scaleLinear()
        .domain([0, 364])
        .range([M.left, width - M.right]),
    [width, M.left, M.right],
  );

  const days = Array.from({ length: 365 }, (_, d) => d);
  const bandPath = (p10: Float32Array, p90: Float32Array) =>
    area<number>()
      .x((d) => x(d))
      .y0((d) => y(p10[d]!))
      .y1((d) => y(p90[d]!))
      .curve(curveMonotoneX)(days) ?? '';
  const linePath = (values: ArrayLike<number>) =>
    line<number>()
      .defined((d) => Number.isFinite(values[d]!))
      .x((d) => x(d))
      .y((d) => y(values[d]!))
      .curve(curveMonotoneX)(days) ?? '';

  const [lo, hi] = y.domain() as [number, number];
  const visibleThresholds = thresholds
    .map((v, i) => ({ v, level: i + 2 }))
    .filter((d, i, all) => d.v > lo && d.v < hi && (i === 0 || d.v !== all[i - 1]!.v));
  // Level markers sit at their threshold but never on top of each other.
  const markers = visibleThresholds.map((d) => ({ ...d, at: y(d.v) })).sort((a, b) => a.at - b.at);
  for (let i = 1; i < markers.length; i++) markers[i]!.at = Math.max(markers[i]!.at, markers[i - 1]!.at + 16);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = Math.round(x.invert(e.clientX - rect.left + M.left));
    setHover(Math.max(0, Math.min(364, d)));
  };

  const baseLabel = `${baseline.start}-${baseline.end}`;
  const recentLabel = `${recent.start}-${recent.end}`;

  return (
    <div className={styles.chartBlock}>
      <Legend
        items={[
          { key: <span className={styles.keyBandOld} aria-hidden="true" />, label: baseLabel },
          { key: <span className={styles.keyBandNew} aria-hidden="true" />, label: recentLabel },
          ...(current
            ? [{ key: <span className={styles.keyNow} aria-hidden="true" />, label: t.climate.thisYear(current.year) }]
            : []),
        ]}
      />
      <div ref={ref} className={styles.chart}>
        <svg width={width} height={height} role="img" aria-label={t.climate.chartSeason}>
          {yTicks.map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - M.right} className={styles.grid} />
              <text x={M.left - 6} dy="0.32em" textAnchor="end" className={styles.tick}>
                {f.temp(v, 0)}
              </text>
            </g>
          ))}
          {visibleThresholds.map(({ v }) => (
            <line key={v} x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className={styles.threshold} />
          ))}
          {markers.map(({ v, level, at }) => (
            <g key={v} aria-hidden="true">
              <rect x={width - M.right + 6} y={at - 7} width={14} height={14} rx={3} fill={levelColor(level)} />
              <text
                x={width - M.right + 13}
                y={at}
                dy="0.34em"
                textAnchor="middle"
                className={styles.levelNum}
                style={{ fill: `var(--on-level-${level})` }}
              >
                {level}
              </text>
            </g>
          ))}
          <path d={bandPath(seasonal.baseline.p10, seasonal.baseline.p90)} className={styles.bandOld} />
          <path d={bandPath(seasonal.recent.p10, seasonal.recent.p90)} className={styles.bandNew} />
          <path d={linePath(seasonal.baseline.p50)} className={styles.lineOld} />
          <path d={linePath(seasonal.recent.p50)} className={styles.lineNew} />
          {current && <path d={linePath(current.daily)} className={styles.lineNow} />}
          <line
            x1={M.left}
            x2={width - M.right}
            y1={height - M.bottom}
            y2={height - M.bottom}
            className={styles.axis}
          />
          {MONTH_STARTS.map((d, m) => (
            <text key={m} x={x(d + 15)} y={height - 8} textAnchor="middle" className={styles.tick}>
              {months[m]}
            </text>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={height - M.bottom} className={styles.crosshair} />
              <circle cx={x(hover)} cy={y(seasonal.recent.p50[hover]!)} r={4} className={styles.dotNew} />
              <circle cx={x(hover)} cy={y(seasonal.baseline.p50[hover]!)} r={4} className={styles.dotOld} />
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
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div className={styles.tooltip} style={{ left: Math.min(Math.max(x(hover), 90), width - 90) }}>
            <p className={styles.tipLabel}>{dayLabel(f.locale, hover)}</p>
            <p className={styles.tipRow}>
              <span className={styles.keyLine} aria-hidden="true" />
              <strong>{f.temp(seasonal.recent.p50[hover]!)}</strong> {recentLabel}
            </p>
            <p className={styles.tipRow}>
              <span className={styles.keyLineOld} aria-hidden="true" />
              <strong>{f.temp(seasonal.baseline.p50[hover]!)}</strong> {baseLabel}
            </p>
            {current && Number.isFinite(current.daily[hover]!) && (
              <p className={styles.tipRow}>
                <span className={styles.keyNowLine} aria-hidden="true" />
                <strong>{f.temp(current.daily[hover]!)}</strong> {current.year}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Return-level curves for both periods, with bootstrap bands and the observed maxima. */
export function ReturnChart({ analysis }: ChartProps) {
  const t = useT();
  const f = useFormat();
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = width < 560 ? 260 : 300;
  const M = { top: 14, right: 16, bottom: 40, left: 38 };
  const [hover, setHover] = useState<{ period: number; value: number; recent: boolean } | null>(null);
  const e = analysis.extremes;
  if (!e) return null;
  const { baselineCurve: bc, recentCurve: rc } = e;

  const all = [
    ...bc.low,
    ...bc.high,
    ...rc.low,
    ...rc.high,
    ...bc.points.map((p) => p.value),
    ...rc.points.map((p) => p.value),
  ].filter(Number.isFinite);
  const x = scaleLog()
    .domain([1.1, 100])
    .range([M.left, width - M.right])
    .clamp(true);
  const y = scaleLinear()
    .domain([Math.floor(Math.min(...all) - 0.3), Math.ceil(Math.max(...all) + 0.3)])
    .range([height - M.bottom, M.top]);

  const curvePath = (periods: number[], values: number[]) =>
    line<number>()
      .defined((_, i) => Number.isFinite(values[i]!))
      .x((p) => x(p))
      .y((_, i) => y(values[i]!))
      .curve(curveMonotoneX)(periods) ?? '';
  const bandPath = (periods: number[], low: number[], high: number[]) =>
    area<number>()
      .defined((_, i) => Number.isFinite(low[i]!) && Number.isFinite(high[i]!))
      .x((p) => x(p))
      .y0((_, i) => y(low[i]!))
      .y1((_, i) => y(high[i]!))
      .curve(curveMonotoneX)(periods) ?? '';

  const T = e.recentPeriod.estimate;
  const level = e.baselineLevel;
  const showAnnotation = Number.isFinite(T) && T > 1.1 && T < 100;
  const baseLabel = `${analysis.baseline.start}-${analysis.baseline.end}`;
  const recentLabel = `${analysis.recent.start}-${analysis.recent.end}`;

  return (
    <div className={styles.chartBlock}>
      <Legend
        items={[
          { key: <span className={styles.keyBandOld} aria-hidden="true" />, label: baseLabel },
          { key: <span className={styles.keyBandNew} aria-hidden="true" />, label: recentLabel },
        ]}
      />
      <div ref={ref} className={styles.chart}>
        <svg width={width} height={height} role="img" aria-label={t.climate.chartReturn}>
          {y.ticks(5).map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - M.right} className={styles.grid} />
              <text x={M.left - 6} dy="0.32em" textAnchor="end" className={styles.tick}>
                {f.temp(v, 0)}
              </text>
            </g>
          ))}
          {[2, 5, 10, 20, 50, 100].map((p) => (
            <g key={p} transform={`translate(${x(p)},0)`}>
              <line y1={M.top} y2={height - M.bottom} className={styles.grid} />
              <text y={height - M.bottom + 16} textAnchor="middle" className={styles.tick}>
                {p}
              </text>
            </g>
          ))}
          <text x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle" className={styles.axisTitle}>
            {t.climate.returnAxis}
          </text>
          <path d={bandPath(bc.periods, bc.low, bc.high)} className={styles.bandOld} />
          <path d={bandPath(rc.periods, rc.low, rc.high)} className={styles.bandNew} />
          <path d={curvePath(bc.periods, bc.level)} className={styles.lineOld} />
          <path d={curvePath(rc.periods, rc.level)} className={styles.lineNew} />
          {showAnnotation && (
            <g>
              <line x1={x(20)} x2={x(T)} y1={y(level)} y2={y(level)} className={styles.annotation} />
              <line x1={x(T)} x2={x(T)} y1={y(level)} y2={height - M.bottom} className={styles.annotation} />
              <circle cx={x(20)} cy={y(level)} r={4.5} className={styles.dotOld} />
              <circle cx={x(T)} cy={y(level)} r={4.5} className={styles.dotNew} />
            </g>
          )}
          {bc.points.map((p) => (
            <circle
              key={`b${p.period}`}
              cx={x(p.period)}
              cy={y(p.value)}
              r={3.5}
              className={styles.pointOld}
              onPointerEnter={() => setHover({ ...p, recent: false })}
              onPointerLeave={(ev) => ev.pointerType === 'mouse' && setHover(null)}
            />
          ))}
          {rc.points.map((p) => (
            <circle
              key={`r${p.period}`}
              cx={x(p.period)}
              cy={y(p.value)}
              r={3.5}
              className={styles.pointNew}
              onPointerEnter={() => setHover({ ...p, recent: true })}
              onPointerLeave={(ev) => ev.pointerType === 'mouse' && setHover(null)}
            />
          ))}
        </svg>
        {hover && (
          <div className={styles.tooltip} style={{ left: Math.min(Math.max(x(hover.period), 90), width - 90) }}>
            <p className={styles.tipValue}>{f.temp(hover.value)}</p>
            <p className={styles.tipLabel}>{hover.recent ? recentLabel : baseLabel}</p>
            <p className={styles.tipRow}>{t.climate.onceEvery(f.number(hover.period, hover.period < 10 ? 1 : 0))}</p>
          </div>
        )}
      </div>
    </div>
  );
}
