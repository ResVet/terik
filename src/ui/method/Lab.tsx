import { useMemo, useState } from 'react';
import { useFormat, useT } from '../../i18n';
import { assess } from '../../lib/guidance/profiles';
import { computeWbgt } from '../../lib/physics/liljegren';
import { SOLAR_CONSTANT } from '../../lib/physics/solar';
import { useStore } from '../../state/store';
import { LevelBadge } from '../components/Level';
import { Slider } from '../components/Slider';
import { adviceFor } from '../forecast/advice';
import styles from './Lab.module.css';

const DEFAULTS = { air: 32, humidity: 60, wind: 2, sun: 60, sunshine: 100 };
const DEG = Math.PI / 180;

/** Clear-sky global irradiance, W/m² (Haurwitz 1945): enough to scale the sunshine slider. */
function clearSky(cosZenith: number): number {
  return cosZenith > 0.01 ? 1098 * cosZenith * Math.exp(-0.057 / cosZenith) : 0;
}

/** The WBGT model with sliders, using exactly the code the forecasts use. */
export function Lab() {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const urban = useStore((s) => s.urban);
  const [state, setState] = useState(DEFAULTS);
  const set = (patch: Partial<typeof DEFAULTS>) => setState((s) => ({ ...s, ...patch }));

  const cosZenith = Math.sin(state.sun * DEG);
  const solar = (clearSky(cosZenith) * state.sunshine) / 100;
  const { sun, shade } = useMemo(() => {
    const input = {
      airTemperature: state.air,
      relativeHumidity: state.humidity,
      pressure: 1013.25,
      windSpeed: state.wind,
      windHeight: 10,
      solar,
      cosZenith,
      toaIrradiance: SOLAR_CONSTANT * cosZenith,
      urban,
    };
    return { sun: computeWbgt(input), shade: computeWbgt({ ...input, solar: 0 }) };
  }, [state, solar, cosZenith, urban]);

  const verdict = assess(sun.wbgt, settings);
  // The weights add up to 1, so the sum works in °F as well, part by part.
  const inUnits = (celsius: number) => (f.units === 'F' ? celsius * 1.8 + 32 : celsius);
  const parts = [
    { key: 'wetBulb', weight: 0.7, value: sun.naturalWetBulb, label: t.method.lab.parts.wetBulb },
    { key: 'globe', weight: 0.2, value: sun.globe, label: t.method.lab.parts.globe },
    { key: 'air', weight: 0.1, value: state.air, label: t.method.lab.parts.air },
  ].map((p) => ({ ...p, share: p.weight * inUnits(p.value) }));
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.share), 0);
  const l = t.method.lab;

  return (
    <div className={styles.lab}>
      <div className={styles.controls}>
        <Slider
          label={l.air}
          min={10}
          max={45}
          step={0.5}
          value={state.air}
          display={f.tempUnit(state.air)}
          onChange={(air) => set({ air })}
        />
        <Slider
          label={l.humidity}
          min={5}
          max={100}
          step={1}
          value={state.humidity}
          display={`${f.integer(state.humidity)}%`}
          onChange={(humidity) => set({ humidity })}
        />
        <Slider
          label={l.wind}
          min={0}
          max={10}
          step={0.1}
          value={state.wind}
          display={`${f.number(state.wind, 1)} m/s`}
          onChange={(wind) => set({ wind })}
        />
        <Slider
          label={l.sunHeight}
          min={2}
          max={90}
          step={1}
          value={state.sun}
          display={`${f.integer(state.sun)}°`}
          onChange={(sun) => set({ sun })}
        />
        <Slider
          label={l.sunshine}
          min={0}
          max={100}
          step={1}
          value={state.sunshine}
          display={`${f.integer(solar)} W/m²`}
          hint={l.sunshineHint(`${f.integer(state.sunshine)}%`)}
          onChange={(sunshine) => set({ sunshine })}
        />
        <button type="button" className={styles.reset} onClick={() => setState(DEFAULTS)}>
          {l.reset}
        </button>
      </div>

      <div className={styles.readout}>
        <p className="kicker">{l.result}</p>
        <p className={styles.big}>{f.temp(sun.wbgt)}</p>
        <div className={styles.verdict}>
          <LevelBadge level={verdict.level} />
          <span>{t.now.forProfile(t.profiles.name[settings.profile])}</span>
        </div>
        <p className={styles.advice}>{adviceFor(t, settings.profile, verdict.level, verdict.workMinutes)}</p>

        <div className={styles.equation}>
          <p className={styles.eqTitle}>{l.equation}</p>
          <div className={styles.bar} aria-hidden="true">
            {parts.map((p) => (
              <span
                key={p.key}
                className={styles[p.key]}
                style={{ flexGrow: Math.max(0, p.share) / Math.max(1e-6, total) }}
              />
            ))}
          </div>
          <dl className={styles.terms}>
            {parts.map((p) => (
              <div key={p.key}>
                <dt>
                  <span className={`${styles.swatch} ${styles[p.key]}`} aria-hidden="true" />
                  {p.label}
                </dt>
                <dd>
                  {f.number(p.weight, 1)} × {f.temp(p.value)} = <strong>{f.number(p.share, 1)}°</strong>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <dl className={styles.facts}>
          <div>
            <dt>{l.shade}</dt>
            <dd>{f.temp(shade.wbgt)}</dd>
          </div>
          <div>
            <dt>{l.wind2m}</dt>
            <dd>{`${f.number(sun.wind2m, 1)} m/s`}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
