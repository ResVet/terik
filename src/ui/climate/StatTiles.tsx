import type { ReactNode } from 'react';
import { lostLevel, type ClimateAnalysis } from '../../lib/climate/analysis';
import { isWorkProfile, type ProfileSettings } from '../../lib/guidance/profiles';
import type { TrendResult } from '../../lib/stats/trend';
import { useFormat, useT, type Formatter } from '../../i18n';
import type { Dictionary } from '../../i18n/en';
import { Icon } from '../components/Icon';
import { Sparkline } from './charts';
import styles from './StatTiles.module.css';

interface Props {
  analysis: ClimateAnalysis;
  settings: ProfileSettings;
}

/** "< 0.001" or "= 0.03", the way p-values are usually quoted. */
export function formatP(f: Formatter, p: number): string {
  if (!Number.isFinite(p)) return '= -';
  if (p < 0.001) return `< ${f.number(0.001, 3)}`;
  return `= ${f.number(p, p < 0.01 ? 3 : 2)}`;
}

const signed = (f: Formatter, v: number, digits: number) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${f.number(Math.abs(v), digits)}`;

/** Counts under ten keep a decimal so small changes do not vanish in rounding. */
const count = (f: Formatter, v: number) => (Math.abs(v) < 10 ? f.number(v, 1) : f.integer(v));

function trendText(t: Dictionary, f: Formatter, trend: TrendResult, format: (perDecade: number) => string): string {
  const p = formatP(f, trend.p);
  if (!(trend.p < 0.05) || !Number.isFinite(trend.slope)) return t.climate.noTrend(p);
  return t.climate.trendLine(format(trend.slope * 10), p);
}

function Tile({
  label,
  lead,
  then,
  now,
  periods,
  children,
}: {
  label: string;
  lead?: string;
  then: string;
  now: string;
  periods: [string, string];
  children: ReactNode;
}) {
  return (
    <article className={styles.tile}>
      <h3 className={styles.label}>{label}</h3>
      {lead && <p className={styles.lead}>{lead}</p>}
      <div className={styles.compare}>
        <span className={styles.thenValue}>
          <span className="visually-hidden">{periods[0]}: </span>
          {then}
        </span>
        <Icon name="chevronRight" size={18} className={styles.arrow} />
        <span className={styles.nowValue}>
          <span className="visually-hidden">{periods[1]}: </span>
          {now}
        </span>
        <span className={styles.period} aria-hidden="true">
          {periods[0]}
        </span>
        <span aria-hidden="true" />
        <span className={styles.period} aria-hidden="true">
          {periods[1]}
        </span>
      </div>
      {children}
    </article>
  );
}

export function StatTiles({ analysis, settings }: Props) {
  const t = useT();
  const f = useFormat();
  const { baseline, recent, trends, years, current, extremes } = analysis;
  const periods: [string, string] = [`${baseline.start}-${baseline.end}`, `${recent.start}-${recent.end}`];
  const level = analysis.minLevel;
  const levelText = `${t.levels.level(level).toLowerCase()} (${t.levels.name[level]})`;
  const work = isWorkProfile(settings.profile);
  const lostDef = work
    ? t.climate.lostHoursWork
    : lostLevel(settings) === 5
      ? t.climate.lostHoursFootball
      : t.climate.lostHoursSport;

  const temp = (v: number) => f.delta(v, Math.abs(v) < 0.1 ? 2 : 1, true);
  const T = extremes?.recentPeriod.estimate ?? Number.NaN;
  const periodText = (v: number) => (v < 10 ? f.number(v, 1) : f.integer(v));
  const beyond = !Number.isFinite(T) || T > 100;

  return (
    <div className={styles.tiles}>
      <Tile
        label={t.climate.hotDays}
        then={count(f, baseline.hotDays)}
        now={count(f, recent.hotDays)}
        periods={periods}
      >
        <Sparkline values={analysis.hotDays} years={years} highlightFrom={recent.start} />
        <p className={styles.trend}>{trendText(t, f, trends.hotDays, (v) => signed(f, v, 1))}</p>
        {current && <p className={styles.soFar}>{t.climate.soFar(current.year, f.integer(current.hotDays))}</p>}
        <p className={styles.def}>{t.climate.hotDaysDef(t.profiles.name[settings.profile], levelText)}</p>
      </Tile>

      <Tile
        label={t.climate.lostHours}
        then={count(f, baseline.lostHours)}
        now={count(f, recent.lostHours)}
        periods={periods}
      >
        <Sparkline values={analysis.lostHours} years={years} highlightFrom={recent.start} />
        <p className={styles.trend}>{trendText(t, f, trends.lostHours, (v) => signed(f, v, 1))}</p>
        {current && <p className={styles.soFar}>{t.climate.soFar(current.year, f.integer(current.lostHours))}</p>}
        <p className={styles.def}>{lostDef}</p>
      </Tile>

      <Tile
        label={t.climate.typical}
        then={f.temp(baseline.meanDailyMax)}
        now={f.temp(recent.meanDailyMax)}
        periods={periods}
      >
        <Sparkline values={analysis.meanDailyMax} years={years} highlightFrom={recent.start} />
        <p className={styles.trend}>{trendText(t, f, trends.meanDailyMax, temp)}</p>
        <p className={styles.def}>{t.climate.typicalDef}</p>
      </Tile>

      {extremes && (
        <Tile
          label={t.climate.rare}
          lead={t.climate.rareDef(f.temp(extremes.baselineLevel))}
          then={`20 ${t.climate.yearsUnit}`}
          now={beyond ? '> 100' : `${periodText(T)} ${t.climate.yearsUnit}`}
          periods={periods}
        >
          <Sparkline
            values={analysis.annualMax}
            years={years}
            highlightFrom={recent.start}
            reference={extremes.baselineLevel}
          />
          <p className={styles.trend}>
            {beyond
              ? t.climate.rareBeyond
              : t.climate.rareRange(
                  periodText(extremes.recentPeriod.low),
                  extremes.recentPeriod.high <= 100 ? periodText(extremes.recentPeriod.high) : '100+',
                )}
          </p>
          <p className={styles.def}>{t.climate.rareNote}</p>
        </Tile>
      )}
    </div>
  );
}
