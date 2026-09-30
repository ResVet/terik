import { useFormat, useT } from '../../i18n';
import { CLOTHING_ADJUSTMENT, METABOLIC_RATE, wbgtLimit, type Clothing, type Workload } from '../../lib/guidance/niosh';
import { WORK_PROFILES } from '../../lib/guidance/profiles';
import { SPORT_THRESHOLDS, type SportRegion } from '../../lib/guidance/sport';
import { LevelBadge } from '../components/Level';
import styles from './Tables.module.css';

/*
 * The tables on the Method page are built from the same constants the app
 * uses, so the page cannot drift out of step with the code.
 */

export function LimitFormulas() {
  const t = useT();
  return (
    <div className={styles.formulas} role="group" aria-label="NIOSH">
      <p>
        <span className={styles.tag}>REL</span>
        <span className={styles.math}>
          WBGT = 56.7 − 11.5 log<sub>10</sub> M
        </span>
        <span className={styles.note}>{t.method.advice.formulaAcclimatised}</span>
      </p>
      <p>
        <span className={styles.tag}>RAL</span>
        <span className={styles.math}>
          WBGT = 59.9 − 14.1 log<sub>10</sub> M
        </span>
        <span className={styles.note}>{t.method.advice.formulaNot}</span>
      </p>
    </div>
  );
}

export function WorkTable() {
  const t = useT();
  const f = useFormat();
  const a = t.method.advice;
  const rows: (Workload | 'rest')[] = [...WORK_PROFILES, 'rest'];
  return (
    <div className={styles.scroll} role="region" aria-label={a.workTable} tabIndex={0}>
      <table className={styles.table}>
        <caption>{a.workTable}</caption>
        <thead>
          <tr>
            <th scope="col">{a.colWork}</th>
            <th scope="col">{a.colRate}</th>
            <th scope="col">{a.colUsed}</th>
            <th scope="col">{a.colNew}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w}>
              <th scope="row">
                <span className={styles.name}>{w === 'rest' ? a.rest : t.profiles.name[w]}</span>
                {w !== 'rest' && <span className={styles.example}>{t.profiles.examples[w]}</span>}
              </th>
              <td>{f.integer(METABOLIC_RATE[w])} W</td>
              <td>{f.temp(wbgtLimit(METABOLIC_RATE[w], true))}</td>
              <td>{f.temp(wbgtLimit(METABOLIC_RATE[w], false))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CLOTHING = Object.keys(CLOTHING_ADJUSTMENT) as Clothing[];

export function ClothingTable() {
  const t = useT();
  const f = useFormat();
  const a = t.method.advice;
  return (
    <div className={styles.scroll} role="region" aria-label={a.clothingTable} tabIndex={0}>
      <table className={styles.table}>
        <caption>{a.clothingTable}</caption>
        <thead>
          <tr>
            <th scope="col">{a.colClothing}</th>
            <th scope="col">{a.colAdd}</th>
          </tr>
        </thead>
        <tbody>
          {CLOTHING.map((c) => (
            <tr key={c}>
              <th scope="row">{t.profiles.clothingName[c]}</th>
              <td>{CLOTHING_ADJUSTMENT[c] === 0 ? '0' : f.delta(CLOTHING_ADJUSTMENT[c], 1, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SportTable() {
  const t = useT();
  const f = useFormat();
  const a = t.method.advice;
  const regions: SportRegion[] = [1, 2, 3];
  return (
    <div className={styles.scroll} role="region" aria-label={a.sportTable} tabIndex={0}>
      <table className={`${styles.table} ${styles.sport}`}>
        <caption>{a.sportTable}</caption>
        <thead>
          <tr>
            <th scope="col">{a.colCategory}</th>
            {([2, 3, 4, 5] as const).map((level) => (
              <th key={level} scope="col">
                <LevelBadge level={level} size="s" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regions.map((r) => (
            <tr key={r}>
              <th scope="row">{t.profiles.regionName[r]}</th>
              {SPORT_THRESHOLDS[r].map((v, i) => (
                <td key={i}>{f.temp(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
