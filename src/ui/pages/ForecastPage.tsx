import { useEffect, useMemo, useRef, useState } from 'react';
import { useComputedForecast, useEnsembleWbgt, useForecast } from '../../data/queries';
import { useT } from '../../i18n';
import { regionFromLocation } from '../../lib/guidance/sport';
import { placeKeyOf, useStore } from '../../state/store';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ClimateContext } from '../forecast/ClimateContext';
import { EnsembleChart } from '../forecast/EnsembleChart';
import { HeatscapeCard } from '../forecast/HeatscapeCard';
import { HourTable } from '../forecast/HourTable';
import { AboutCard, FirstAidCard } from '../forecast/InfoCards';
import { buildWeek, currentHourIndex } from '../forecast/model';
import { NowPanel } from '../forecast/NowPanel';
import { Planner } from '../forecast/Planner';
import { ProfilePanel } from '../forecast/ProfilePanel';
import { useNow } from '../hooks/useNow';
import styles from './ForecastPage.module.css';

export function ForecastPage() {
  const t = useT();
  const place = useStore((s) => s.place);
  const urban = useStore((s) => s.urban);
  const settings = useStore((s) => s.settings);
  const regionPinned = useStore((s) => s.regionPinned);
  const regionInfo = useStore((s) => s.regionInfo);
  const setRegion = useStore((s) => s.setRegion);
  const now = useNow();

  const forecast = useForecast(place);
  const computed = useComputedForecast(forecast.data, urban);
  const grid = forecast.data?.grid;
  const { ensemble, computed: ensembleWbgt } = useEnsembleWbgt(place, grid, urban);
  const timeZone = grid?.timezone ?? place?.timezone ?? 'UTC';

  // Sport region: from this place's climate record if one was built, otherwise
  // a guess from latitude and altitude. A hand-picked region always wins.
  const measured = place && regionInfo?.key === placeKeyOf(place) ? regionInfo : null;
  useEffect(() => {
    if (!grid || regionPinned) return;
    const region = measured ? measured.region : regionFromLocation(grid.latitude, grid.elevation);
    if (region !== settings.region) setRegion(region, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid?.latitude, grid?.elevation, regionPinned, measured?.region]);

  const week = useMemo(
    () => (computed.data ? buildWeek(computed.data.hourly, ensembleWbgt.data, settings, timeZone, now) : null),
    [computed.data, ensembleWbgt.data, settings, timeZone, now],
  );

  const [selected, setSelected] = useState<number | null>(null);
  const placeKey = place ? `${place.latitude},${place.longitude}` : '';
  const lastPlace = useRef(placeKey);
  useEffect(() => {
    if (lastPlace.current !== placeKey) {
      lastPlace.current = placeKey;
      setSelected(null);
    }
  }, [placeKey]);
  const selectedIndex = week
    ? selected !== null && selected < week.hours.length
      ? selected
      : currentHourIndex(week, now)
    : 0;

  const ensembleStatus: 'loading' | 'ready' | 'error' =
    ensemble.isError || ensembleWbgt.isError ? 'error' : ensembleWbgt.data ? 'ready' : 'loading';

  if (!place) {
    return (
      <div className={`wrap ${styles.page}`}>
        <p className={styles.waiting}>{t.common.loading}</p>
      </div>
    );
  }

  if (forecast.isError && !forecast.data) {
    return (
      <div className={`wrap ${styles.page}`}>
        <Card title={t.common.error}>
          <p className={styles.errorText}>{(forecast.error as Error)?.message}</p>
          <button type="button" className={styles.retry} onClick={() => forecast.refetch()}>
            <Icon name="refresh" size={16} />
            {t.common.retry}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`wrap ${styles.page}`}>
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <NowPanel place={place} timeZone={timeZone} now={computed.data?.now} loading={!computed.data} />
          <ProfilePanel regionP90={measured?.p90} />
        </div>
        <div className={styles.heroRight}>
          {week ? (
            <HeatscapeCard
              week={week}
              timeZone={timeZone}
              placeName={place.name}
              now={now}
              selected={selectedIndex}
              onSelect={setSelected}
            />
          ) : (
            <Card title={t.heatscape.title} subtitle={t.heatscape.subtitle}>
              <div className={styles.placeholder} aria-busy="true">
                {t.common.loading}
              </div>
            </Card>
          )}
        </div>
      </div>

      {week && (
        <div className={styles.sections}>
          <Planner week={week} timeZone={timeZone} placeName={place.name} now={now} />
          <EnsembleChart week={week} timeZone={timeZone} now={now} status={ensembleStatus} />
          <HourTable week={week} timeZone={timeZone} now={now} selected={selectedIndex} onSelect={setSelected} />
          <div className={styles.pair}>
            <ClimateContext week={week} timeZone={timeZone} now={now} />
            <AboutCard />
          </div>
          <FirstAidCard />
          <p className={styles.attribution}>
            <a href="https://open-meteo.com/" target="_blank" rel="noopener">
              Weather data by Open-Meteo.com
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
