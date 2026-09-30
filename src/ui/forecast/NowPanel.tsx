import { useFormat, useT } from '../../i18n';
import { assess, isWorkProfile, levelThresholds } from '../../lib/guidance/profiles';
import type { Place } from '../../state/store';
import { useStore } from '../../state/store';
import type { ComputedNow } from '../../workers/compute.worker';
import { Icon } from '../components/Icon';
import { LevelBadge, LevelScale } from '../components/Level';
import { adviceFor } from './advice';
import styles from './NowPanel.module.css';

interface Props {
  place: Place;
  timeZone: string;
  now: ComputedNow | undefined;
  loading: boolean;
}

export function NowPanel({ place, timeZone, now, loading }: Props) {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const wbgt = now?.wbgt ?? Number.NaN;
  const { level, workMinutes } = assess(wbgt, settings);
  const thresholds = levelThresholds(settings);
  const shadeDelta = now ? now.wbgt - now.shade : Number.NaN;
  const place2 = [place.admin, place.country].filter(Boolean).join(', ');
  const profileName = t.profiles.name[settings.profile];
  const showWater = Number.isFinite(wbgt) && (level >= 2 || !isWorkProfile(settings.profile));

  return (
    <section className={styles.panel} aria-labelledby="now-title" aria-busy={loading}>
      <div className={styles.placeRow}>
        <h1 id="now-title" className={styles.place}>
          {place.name}
        </h1>
        {place2 && <p className={styles.region}>{place2}</p>}
      </div>

      <div className={styles.reading}>
        <p className="kicker">
          {t.now.kicker}
          {now && Number.isFinite(now.time) ? ` · ${f.time(now.time, timeZone)}` : ''}
        </p>
        <p className={styles.value} aria-live="polite">
          <span className={styles.number}>{Number.isFinite(wbgt) ? f.temp(wbgt).replace('°', '') : '--'}</span>
          <span className={styles.unit}>{f.unitSymbol}</span>
        </p>
        <p className={styles.caption}>{t.now.wbgt}</p>
      </div>

      <div className={styles.status}>
        {Number.isFinite(wbgt) ? (
          <>
            <div className={styles.levelLine}>
              <LevelBadge level={level} size="l" />
              <span className={styles.forProfile}>{t.now.forProfile(profileName)}</span>
            </div>
            <p className={styles.advice}>{adviceFor(t, settings.profile, level, workMinutes)}</p>
            <LevelScale thresholds={thresholds} value={wbgt} />
            {showWater && (
              <p className={styles.tip}>
                <Icon name="water" size={18} />
                <span>{t.advice.water}</span>
              </p>
            )}
            {Number.isFinite(shadeDelta) && shadeDelta >= 0.5 && (
              <p className={styles.tip}>
                <Icon name="shade" size={18} />
                <span>{t.advice.shadeHelps(f.delta(shadeDelta))}</span>
              </p>
            )}
          </>
        ) : (
          <p className={styles.advice}>{loading ? t.common.loading : t.common.error}</p>
        )}
      </div>

      <dl className={styles.readings}>
        <div>
          <dt>
            <Icon name="shade" size={16} /> {t.now.shade}
          </dt>
          <dd>{now ? f.temp(now.shade) : '--'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="thermometer" size={16} /> {t.now.air}
          </dt>
          <dd>{now ? f.temp(now.airTemperature) : '--'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="drop" size={16} /> {t.now.humidity}
          </dt>
          <dd>{now ? `${f.integer(now.relativeHumidity)}%` : '--'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="wind" size={16} /> {t.now.wind}
          </dt>
          <dd>{now ? `${f.number(now.windSpeed, 1)} m/s` : '--'}</dd>
        </div>
        <div>
          <dt>
            <Icon name="sun" size={16} /> {t.now.sun}
          </dt>
          <dd>{now ? (now.solar > 1 ? `${f.integer(now.solar)} W/m²` : t.now.night) : '--'}</dd>
        </div>
      </dl>
    </section>
  );
}
