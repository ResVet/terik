import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useResolvedTheme } from '../../app/useDocument';
import { useFormat, useT } from '../../i18n';
import { useStore } from '../../state/store';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { LevelBadge, LevelLegend } from '../components/Level';
import { Segmented } from '../components/Segmented';
import { useCoarsePointer, useReducedMotion } from '../hooks/useMedia';
import { hasWebGL } from '../three/support';
import { adviceFor } from './advice';
import { HeatGrid } from './HeatGrid';
import type { Week } from './model';
import styles from './HeatscapeCard.module.css';

const Heatscape3D = lazy(() => import('../three/Heatscape3D'));

interface Props {
  week: Week;
  timeZone: string;
  placeName: string;
  now: number;
  selected: number;
  onSelect: (index: number) => void;
}

export function HeatscapeCard({ week, timeZone, placeName, now, selected, onSelect }: Props) {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const theme = useResolvedTheme();
  const webgl = useMemo(() => hasWebGL(), []);
  const [view, setView] = useState<'3d' | 'grid'>(webgl ? '3d' : 'grid');
  const reducedMotion = useReducedMotion();
  const coarse = useCoarsePointer();

  const hour = week.hours[selected];
  const profiles = useMemo(() => week.days.map((d) => d.profile), [week]);
  const dayLabels = useMemo(
    () => week.days.map((d, i) => (i === 0 ? t.common.today : f.weekday(d.start + 12 * 3_600_000, timeZone))),
    [week, t, f, timeZone],
  );
  const formatTemp = useCallback((v: number) => f.temp(v, 0), [f]);

  const selectedCell = hour ? { day: hour.day, hour: hour.hour } : null;
  const selectByCell = (day: number, h: number) => {
    const index = week.hours.findIndex((x) => x.day === day && x.hour === h);
    if (index >= 0) onSelect(index);
  };

  return (
    <Card
      id="week"
      title={t.heatscape.title}
      subtitle={t.heatscape.subtitle}
      className={styles.card}
      actions={
        webgl ? (
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
      {view === '3d' && webgl ? (
        <div className={styles.stage}>
          <Suspense fallback={<div className={styles.loading}>{t.heatscape.loading3d}</div>}>
            <Heatscape3D
              profiles={profiles}
              dayLabels={dayLabels}
              thresholds={week.thresholds}
              formatTemp={formatTemp}
              nowOffset={week.nowOffset}
              nowLabel={t.heatscape.now}
              selected={selectedCell}
              onSelect={selectByCell}
              dark={theme === 'dark'}
              reducedMotion={reducedMotion}
              ariaLabel={t.heatscape.ariaLabel(placeName)}
            />
          </Suspense>
          <p className={styles.hint}>{coarse ? t.heatscape.hintTouch : t.heatscape.hintMouse}</p>
        </div>
      ) : (
        <>
          {!webgl && <p className={styles.note}>{t.heatscape.noWebgl}</p>}
          <HeatGrid week={week} timeZone={timeZone} now={now} selected={selected} onSelect={onSelect} />
        </>
      )}

      {hour && (
        <div className={styles.detail} aria-live="polite">
          <div className={styles.detailWhen}>
            <span className={styles.detailDay}>{f.dayLabel(hour.time, timeZone, now)}</span>
            <span className={styles.detailTime}>{f.time(hour.time, timeZone)}</span>
          </div>
          <div className={styles.detailValue}>
            <span className={styles.detailNumber}>{f.temp(hour.wbgt)}</span>
            <span className={styles.detailUnit}>WBGT</span>
          </div>
          <div className={styles.detailLevel}>
            <LevelBadge level={hour.level} />
            <p>{adviceFor(t, settings.profile, hour.level, hour.workMinutes)}</p>
          </div>
          <dl className={styles.detailFacts}>
            <div>
              <dt>{t.now.shade}</dt>
              <dd>{f.temp(hour.shade)}</dd>
            </div>
            <div>
              <dt>{t.now.air}</dt>
              <dd>{f.temp(hour.air)}</dd>
            </div>
            <div>
              <dt>{t.now.humidity}</dt>
              <dd>{f.integer(hour.humidity)}%</dd>
            </div>
            <div>
              <dt>{t.now.sun}</dt>
              <dd>{hour.solar > 1 ? `${f.integer(hour.solar)} W/m²` : '0'}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className={styles.legend}>
        <LevelLegend />
      </div>
    </Card>
  );
}
