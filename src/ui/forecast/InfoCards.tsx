import { Link } from 'wouter';
import { useT } from '../../i18n';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import styles from './InfoCards.module.css';

export function FirstAidCard() {
  const t = useT();
  return (
    <Card id="first-aid" title={t.firstAid.title}>
      <div className={styles.stroke}>
        <p className={styles.alert}>
          <Icon name="alert" size={20} />
          <strong>{t.firstAid.strokeTitle}</strong>
        </p>
        <p className={styles.signs}>{t.firstAid.strokeSigns}</p>
        <ol className={styles.steps}>
          <li>
            <Icon name="phone" size={18} />
            <span>{t.firstAid.step1}</span>
          </li>
          <li>
            <Icon name="drop" size={18} />
            <span>{t.firstAid.step2}</span>
          </li>
          <li>
            <Icon name="clock" size={18} />
            <span>{t.firstAid.step3}</span>
          </li>
        </ol>
      </div>
      <div className={styles.exhaustion}>
        <h3>{t.firstAid.exhaustionTitle}</h3>
        <p>{t.firstAid.exhaustion}</p>
      </div>
      <p className={styles.source}>{t.firstAid.source}</p>
    </Card>
  );
}

export function AboutCard() {
  const t = useT();
  return (
    <Card id="about" title={t.about.title}>
      <p className={styles.body}>{t.about.body}</p>
      <div
        className={styles.formula}
        aria-label="WBGT = 0.7 × natural wet bulb + 0.2 × black globe + 0.1 × air temperature"
      >
        <span className={styles.term}>
          <b>0.7</b> T<sub>nwb</sub>
        </span>
        <span className={styles.plus}>+</span>
        <span className={styles.term}>
          <b>0.2</b> T<sub>g</sub>
        </span>
        <span className={styles.plus}>+</span>
        <span className={styles.term}>
          <b>0.1</b> T<sub>a</sub>
        </span>
      </div>
      <Link href="/method" className={styles.link}>
        {t.about.link}
        <Icon name="chevronRight" size={16} />
      </Link>
    </Card>
  );
}
