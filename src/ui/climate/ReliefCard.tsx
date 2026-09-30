import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useResolvedTheme } from '../../app/useDocument';
import { chunkPlan, FIRST_YEAR, type ClimateProgress } from '../../data/climate';
import type { ClimateStatus } from '../../data/queries';
import { useFormat, useT } from '../../i18n';
import { assess, levelsFor, levelThresholds, type ProfileSettings } from '../../lib/guidance/profiles';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { LevelBadge, LevelLegend } from '../components/Level';
import { Segmented } from '../components/Segmented';
import { useCoarsePointer, useMedia, useReducedMotion } from '../hooks/useMedia';
import { hasWebGL } from '../three/support';
import { CalendarGrid } from './CalendarGrid';
import { monthNames } from './charts';
import { binDays, hottestCell, type YearGrid } from './reliefData';
import styles from './ReliefCard.module.css';

const Relief3D = lazy(() => import('../three/Relief3D'));

interface Props {
  status: ClimateStatus;
  /** A finished record is on screen (it may be refreshing). */
  complete: boolean;
  progress: ClimateProgress | null;
  grid: YearGrid;
  settings: ProfileSettings;
  placeName: string;
  onBuild: () => void;
  onRetry: () => void;
}

/** Seconds left in the current pause, ticking down between progress reports. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

const dayFormat = (locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function ReliefCard({ status, complete, progress, grid, settings, placeName, onBuild, onRetry }: Props) {
  const t = useT();
  const f = useFormat();
  const theme = useResolvedTheme();
  const reducedMotion = useReducedMotion();
  const coarse = useCoarsePointer();
  const narrow = useMedia('(max-width: 479px)');
  const webgl = useMemo(() => hasWebGL(), []);
  const [view, setView] = useState<'3d' | 'grid'>(webgl ? '3d' : 'grid');
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  const detailId = useId();
  const countdown = useCountdown(progress?.pausedUntil ?? null);

  const thresholds = useMemo(() => levelThresholds(settings), [settings]);
  const levels = useMemo(() => levelsFor(grid.values, settings), [grid, settings]);
  const record = useMemo(() => hottestCell(grid), [grid]);
  const hasAny = record !== null;
  const selected = picked ?? record;
  const months = useMemo(() => monthNames(f.locale, narrow ? 'narrow' : 'short'), [f.locale, narrow]);
  const formatTemp = useCallback((v: number) => f.temp(v, 0), [f]);

  const chunks = useMemo(() => {
    const loaded = new Set(progress?.years.filter((y) => y.wbgt.some(Number.isFinite)).map((y) => y.year));
    return chunkPlan()
      .sort((a, b) => a.from - b.from)
      .map((c) => {
        let done = false;
        for (let y = c.from; y <= c.to && !done; y++) done = loaded.has(y);
        return { from: c.from, to: c.to, done };
      });
  }, [progress]);

  const first = grid.years[0] ?? FIRST_YEAR;
  const last = grid.years.at(-1) ?? FIRST_YEAR;
  const fetching = status === 'loading' || (status === 'checking' && (progress?.done ?? 0) > 0);
  const showStage = hasAny || fetching;
  const showProgress = fetching && !complete;

  let title = t.climate.reliefTitle(FIRST_YEAR);
  let subtitle: string = t.climate.reliefSubtitle;
  if (status === 'idle' && !hasAny) {
    title = t.climate.buildTitle;
    subtitle = t.climate.buildBody;
  } else if (status === 'checking' && !hasAny) {
    subtitle = t.climate.checking;
  } else if (status === 'empty') {
    subtitle = t.climate.noData;
  }

  const cell = selected && hasAny ? grid.values[selected.row * grid.cols + selected.col]! : Number.NaN;
  const cellLevel = Number.isFinite(cell) ? assess(cell, settings).level : null;
  const isRecord = !!selected && !!record && selected.row === record.row && selected.col === record.col;
  const fmt = dayFormat(f.locale);
  const range = selected
    ? (binDays(selected.col).map((d) => fmt.format(Date.UTC(2001, 0, 1 + d))) as [string, string])
    : null;

  return (
    <Card
      id="relief"
      title={title}
      subtitle={subtitle}
      className={styles.card}
      actions={
        webgl && showStage ? (
          <Segmented
            label={t.heatscape.viewLabel}
            hideLabel
            size="s"
            value={view}
            onChange={setView}
            options={[
              {
                value: '3d',
                label: (
                  <>
                    <Icon name="cube" size={16} /> {t.heatscape.view3d}
                  </>
                ),
              },
              {
                value: 'grid',
                label: (
                  <>
                    <Icon name="grid" size={16} /> {t.heatscape.viewGrid}
                  </>
                ),
              },
            ]}
          />
        ) : undefined
      }
    >
      {status === 'idle' && !hasAny && (
        <div className={styles.build}>
          <button type="button" className={styles.primary} onClick={onBuild}>
            <Icon name="download" size={18} />
            {t.climate.build}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.problem} role="alert">
          <Icon name="alert" size={18} />
          <p>{t.climate.failed}</p>
          <button type="button" className={styles.secondary} onClick={onRetry}>
            <Icon name="refresh" size={16} />
            {t.climate.retry}
          </button>
        </div>
      )}

      {showProgress && (
        <div className={styles.progress}>
          <p className={styles.progressLine} aria-live="polite">
            {progress ? t.climate.progress(progress.done, progress.total) : t.common.loading}
          </p>
          <div
            className={styles.blocks}
            role="progressbar"
            aria-label={t.climate.blocks(chunks[0]?.from ?? FIRST_YEAR, chunks.at(-1)?.to ?? last)}
            aria-valuemin={0}
            aria-valuemax={chunks.length}
            aria-valuenow={chunks.filter((c) => c.done).length}
          >
            {chunks.map((c) => (
              <span key={c.from} className={c.done ? styles.blockDone : styles.block} title={`${c.from}-${c.to}`} />
            ))}
          </div>
          <div className={styles.blockEnds} aria-hidden="true">
            <span>{chunks[0]?.from ?? FIRST_YEAR}</span>
            <span>{chunks.at(-1)?.to ?? last}</span>
          </div>
          {countdown > 0 && <p className={styles.pause}>{t.climate.waiting(countdown)}</p>}
        </div>
      )}

      {complete && status === 'loading' && (
        <p className={styles.updating}>
          <span className={styles.spinner} aria-hidden="true" />
          {t.climate.updating}
        </p>
      )}

      {showStage &&
        (view === '3d' && webgl ? (
          <div className={styles.stage}>
            <Suspense fallback={<div className={styles.loading}>{t.heatscape.loading3d}</div>}>
              <Relief3D
                grid={grid.values}
                rows={grid.rows}
                cols={grid.cols}
                years={grid.years}
                monthLabels={months}
                thresholds={thresholds}
                selected={hasAny ? selected : null}
                onHover={(row, col) => setPicked({ row, col })}
                formatTemp={formatTemp}
                dark={theme === 'dark'}
                reducedMotion={reducedMotion}
                ariaLabel={t.climate.reliefAria(placeName, first, last)}
              />
            </Suspense>
            {hasAny && <p className={styles.hint}>{coarse ? t.heatscape.hintTouch : t.heatscape.hintMouse}</p>}
          </div>
        ) : (
          <div className={styles.flat}>
            <CalendarGrid
              levels={levels}
              rows={grid.rows}
              cols={grid.cols}
              years={grid.years}
              monthLabels={months}
              selected={hasAny ? selected : null}
              onSelect={(row, col) => setPicked({ row, col })}
              label={t.climate.gridAria(first, last)}
              describedBy={detailId}
            />
          </div>
        ))}

      {hasAny && selected && range && (
        <div className={styles.detail} id={detailId} aria-live="polite">
          <div className={styles.when}>
            <span className={styles.year}>{grid.years[selected.row]}</span>
            <span className={styles.days}>{t.planner.range(range[0], range[1])}</span>
          </div>
          <div className={styles.value}>
            <span className={styles.number}>{Number.isFinite(cell) ? f.temp(cell) : '-'}</span>
            <span className={styles.unit}>WBGT</span>
          </div>
          <div className={styles.level}>
            {cellLevel && <LevelBadge level={cellLevel} size="s" />}
            <p>{isRecord ? t.climate.hottest : t.climate.stepNote}</p>
          </div>
        </div>
      )}

      {showStage && (
        <div className={styles.legend}>
          <LevelLegend />
          {showProgress && <span className={styles.pendingKey}>{t.climate.notYet}</span>}
        </div>
      )}
    </Card>
  );
}
