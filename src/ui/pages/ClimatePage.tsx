import { useEffect, useMemo, useState } from 'react';
import { placeLabel } from '../../app/usePlace';
import { FIRST_YEAR, lastCompleteYear } from '../../data/climate';
import { climateKey, periodsFor, useClimateAnalysis, useClimateData, useForecast } from '../../data/queries';
import { useT } from '../../i18n';
import { levelThresholds, type Level } from '../../lib/guidance/profiles';
import { placeKeyOf, useStore } from '../../state/store';
import { HotDaysChart, ReturnChart, SeasonChart } from '../climate/charts';
import { ReliefCard } from '../climate/ReliefCard';
import { yearGrid } from '../climate/reliefData';
import { StatTiles } from '../climate/StatTiles';
import { YearTable } from '../climate/YearTable';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { levelColor } from '../components/Level';
import { Segmented } from '../components/Segmented';
import { ProfilePanel } from '../forecast/ProfilePanel';
import styles from './ClimatePage.module.css';

const HOT_LEVELS: Level[] = [3, 4, 5];

export default function ClimatePage() {
  const t = useT();
  const place = useStore((s) => s.place);
  const urban = useStore((s) => s.urban);
  const settings = useStore((s) => s.settings);
  const regionInfo = useStore((s) => s.regionInfo);
  const setRegionInfo = useStore((s) => s.setRegionInfo);
  const [minLevel, setMinLevel] = useState<Level>(3);

  // The time zone decides where each local day starts. Places from search carry
  // one; for the rest, borrow the forecast's (the same request the forecast page makes).
  const forecast = useForecast(place && !place.timezone ? place : null);
  const timeZone = place?.timezone ?? forecast.data?.grid.timezone;
  const zoneKnown = !!place && (!!place.timezone || forecast.isSuccess || forecast.isError);

  const key = climateKey(place, urban);
  const [wanted, setWanted] = useState<string | null>(null);
  const climate = useClimateData(zoneKnown ? place : null, timeZone, urban, wanted === key);
  const data = climate.data;

  // Pick up a record that was started on an earlier visit, and top up the
  // current year when the saved copy is more than a day old.
  const resume = climate.status === 'idle' && (climate.progress?.done ?? 0) > 0;
  const refresh = climate.status === 'ready' && data?.stale === true;
  // Once switched on for a place, downloading stays on (set while rendering, so there is no extra pass).
  if ((resume || refresh) && wanted !== key) setWanted(key);

  const last = data?.lastCompleteYear ?? lastCompleteYear();
  const source = data?.years ?? climate.progress?.years;
  const grid = useMemo(() => yearGrid(source ?? [], FIRST_YEAR, last), [source, last]);

  const analysis = useClimateAnalysis(climate.status === 'empty' ? null : data, { settings, minLevel });
  const result = analysis.data;

  useEffect(() => {
    if (!place || !result || !Number.isFinite(result.warmSeasonP90)) return;
    const k = placeKeyOf(place);
    if (regionInfo?.key === k && regionInfo.p90 === result.warmSeasonP90 && regionInfo.region === result.region) return;
    setRegionInfo({ key: k, p90: result.warmSeasonP90, region: result.region });
  }, [place, result, regionInfo, setRegionInfo]);

  const thresholds = useMemo(() => levelThresholds(settings), [settings]);

  if (!place) {
    return (
      <div className={`wrap ${styles.page}`}>
        <p className={styles.waiting}>{t.common.loading}</p>
      </div>
    );
  }

  const measured = regionInfo?.key === placeKeyOf(place) ? regionInfo : null;
  const periods = periodsFor(last);
  const base = `${periods.baseline.start}-${periods.baseline.end}`;
  const recent = `${periods.recent.start}-${periods.recent.end}`;

  return (
    <div className={`wrap ${styles.page}`}>
      <div className={styles.hero}>
        <header className={styles.intro}>
          <p className="kicker">{placeLabel(place)}</p>
          <h1 className={styles.title}>{t.climate.title(place.name)}</h1>
          <p className={styles.lead}>{t.climate.intro(FIRST_YEAR, base, recent)}</p>
        </header>
        <div className={styles.profile}>
          <ProfilePanel regionP90={measured?.p90} />
        </div>
        <div className={styles.relief}>
          <ReliefCard
            key={key}
            status={climate.status}
            complete={data !== null}
            progress={climate.progress}
            grid={grid}
            settings={settings}
            placeName={place.name}
            onBuild={() => setWanted(key)}
            onRetry={climate.retry}
          />
        </div>
      </div>

      {data && !result && climate.status !== 'empty' && (
        <p className={styles.computing} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {t.climate.computing}
        </p>
      )}

      {result && data && (
        <div
          className={`${styles.sections} ${analysis.isPlaceholderData ? styles.updating : ''}`}
          aria-busy={analysis.isFetching}
        >
          <StatTiles analysis={result} settings={settings} />

          <Card id="season" title={t.climate.chartSeason} subtitle={t.climate.chartSeasonSub}>
            <SeasonChart analysis={result} thresholds={thresholds} />
          </Card>

          <div className={styles.pair}>
            <Card
              id="hot-days"
              title={t.climate.chartHot}
              subtitle={t.climate.chartHotSub}
              actions={
                <Segmented
                  label={t.climate.minLevel}
                  size="s"
                  value={minLevel}
                  onChange={setMinLevel}
                  options={HOT_LEVELS.map((n) => ({
                    value: n,
                    title: t.climate.minLevelOption(n),
                    label: (
                      <>
                        <i className={styles.levelDot} style={{ background: levelColor(n) }} aria-hidden="true" />
                        {n < 5 ? `${n}+` : n}
                      </>
                    ),
                  }))}
                />
              }
            >
              <HotDaysChart analysis={result} />
            </Card>

            <Card id="return" title={t.climate.chartReturn} subtitle={t.climate.chartReturnSub}>
              <ReturnChart analysis={result} />
              <p className={styles.caption}>{t.climate.returnNote}</p>
            </Card>
          </div>

          <YearTable analysis={result} data={data} placeName={place.name} settings={settings} />

          <Card id="notes" title={t.climate.notesTitle}>
            <ul className={styles.notes}>
              {t.climate.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className={styles.facts}>
              <p>{t.climate.region(t.profiles.regionName[result.region])}</p>
              <p className={styles.saved}>
                <Icon name="check" size={16} />
                {t.climate.cached}
              </p>
            </div>
          </Card>

          <p className={styles.attribution}>
            <a href="https://open-meteo.com/" target="_blank" rel="noopener">
              Weather data by Open-Meteo.com
            </a>
            {'. '}
            {t.climate.copernicus(new Date(data.loadedAt).getUTCFullYear())}
          </p>
        </div>
      )}
    </div>
  );
}
