import { useT } from '../../i18n';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import styles from './Footer.module.css';

export const REPO_URL = 'https://github.com/ResVet/terik';

export function Footer() {
  const t = useT();
  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <div className={styles.brand}>
          <LogoMark size={22} />
          <p className={styles.disclaimer}>{t.footer.disclaimer}</p>
        </div>
        <div className={styles.credits}>
          <p>
            {t.footer.data.split('Open-Meteo.com')[0]}
            <a href="https://open-meteo.com/" rel="noopener" target="_blank">
              Open-Meteo.com
            </a>
            {t.footer.data.split('Open-Meteo.com')[1]}
          </p>
          <p>{t.footer.model}</p>
        </div>
        <div className={styles.meta}>
          <span>{t.footer.made}</span>
          <a href={REPO_URL} rel="noopener" target="_blank" className={styles.repo}>
            <Icon name="github" size={16} />
            {t.footer.source}
          </a>
          <a href={`${REPO_URL}/blob/main/LICENSE`} rel="noopener" target="_blank">
            {t.footer.licence}
          </a>
        </div>
      </div>
    </footer>
  );
}
