import { useId } from 'react';
import { useFormat, useT } from '../../i18n';
import type { Clothing } from '../../lib/guidance/niosh';
import { isWorkProfile, PROFILES, type ProfileId } from '../../lib/guidance/profiles';
import type { SportRegion } from '../../lib/guidance/sport';
import { useStore } from '../../state/store';
import { Segmented } from '../components/Segmented';
import styles from './ProfilePanel.module.css';

const CLOTHING: Clothing[] = [
  'workClothes',
  'clothCoveralls',
  'smsCoveralls',
  'polyolefinCoveralls',
  'doubleLayer',
  'vapourBarrier',
];

interface Props {
  /** 90th percentile of warm-season peaks when the climate record is loaded. */
  regionP90?: number | undefined;
}

export function ProfilePanel({ regionP90 }: Props) {
  const t = useT();
  const f = useFormat();
  const settings = useStore((s) => s.settings);
  const regionPinned = useStore((s) => s.regionPinned);
  const urban = useStore((s) => s.urban);
  const setSettings = useStore((s) => s.setSettings);
  const setRegion = useStore((s) => s.setRegion);
  const setUrban = useStore((s) => s.setUrban);
  const clothingId = useId();
  const regionId = useId();
  const acclimatisedId = useId();
  const work = isWorkProfile(settings.profile);

  return (
    <section className={styles.panel} aria-labelledby="profile-title">
      <h2 id="profile-title" className={styles.title}>
        {t.profiles.title}
      </h2>
      <div className={styles.chips} role="radiogroup" aria-labelledby="profile-title">
        {PROFILES.map((p: ProfileId) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={settings.profile === p}
            className={styles.chip}
            onClick={() => setSettings({ profile: p })}
            onKeyDown={(e) => {
              const i = PROFILES.indexOf(p);
              const next =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? PROFILES[(i + 1) % PROFILES.length]
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? PROFILES[(i - 1 + PROFILES.length) % PROFILES.length]
                    : null;
              if (next) {
                e.preventDefault();
                setSettings({ profile: next });
                const sibling = e.currentTarget.parentElement?.children[PROFILES.indexOf(next)] as
                  HTMLElement | undefined;
                sibling?.focus();
              }
            }}
            tabIndex={settings.profile === p ? 0 : -1}
          >
            {t.profiles.name[p]}
          </button>
        ))}
      </div>
      <p className={styles.examples}>{t.profiles.examples[settings.profile]}</p>

      <div className={styles.options}>
        {work ? (
          <>
            <label className={styles.switch} htmlFor={acclimatisedId}>
              <input
                id={acclimatisedId}
                type="checkbox"
                role="switch"
                checked={settings.acclimatised}
                onChange={(e) => setSettings({ acclimatised: e.target.checked })}
              />
              <span className={styles.switchTrack} aria-hidden="true" />
              <span className={styles.switchText}>
                <span>{t.profiles.acclimatised}</span>
                <small>{t.profiles.acclimatisedHint}</small>
              </span>
            </label>
            <div className={styles.field}>
              <label htmlFor={clothingId}>{t.profiles.clothing}</label>
              <select
                id={clothingId}
                value={settings.clothing}
                onChange={(e) => setSettings({ clothing: e.target.value as Clothing })}
              >
                {CLOTHING.map((c) => (
                  <option key={c} value={c}>
                    {t.profiles.clothingName[c]}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : settings.profile === 'sport' ? (
          <div className={styles.field}>
            <label htmlFor={regionId}>{t.profiles.region}</label>
            <select
              id={regionId}
              value={settings.region}
              onChange={(e) => setRegion(Number(e.target.value) as SportRegion, true)}
            >
              {([1, 2, 3] as const).map((r) => (
                <option key={r} value={r}>
                  {t.profiles.regionName[r]}
                </option>
              ))}
            </select>
            <small>
              {regionP90 !== undefined && !regionPinned
                ? t.profiles.regionFromData(f.temp(regionP90))
                : t.profiles.regionGuess}
            </small>
          </div>
        ) : null}

        <div className={styles.field}>
          <Segmented
            label={t.profiles.surroundings}
            size="s"
            value={urban ? 'urban' : 'open'}
            onChange={(v) => setUrban(v === 'urban')}
            options={[
              { value: 'urban', label: t.profiles.urban },
              { value: 'open', label: t.profiles.open },
            ]}
          />
          <small>{t.profiles.surroundingsHint}</small>
        </div>
      </div>
    </section>
  );
}
