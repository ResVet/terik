import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useT } from '../../i18n';
import { useStore } from '../../state/store';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/Logo';
import { PlaceSearch } from '../components/PlaceSearch';
import { Segmented } from '../components/Segmented';
import styles from './Header.module.css';

export const ROUTES = [
  { href: '/', key: 'forecast', icon: 'forecast' },
  { href: '/climate', key: 'climate', icon: 'climate' },
  { href: '/method', key: 'method', icon: 'method' },
] as const;

export function SettingsControls() {
  const t = useT();
  const language = useStore((s) => s.language);
  const units = useStore((s) => s.units);
  const theme = useStore((s) => s.theme);
  const setLanguage = useStore((s) => s.setLanguage);
  const setUnits = useStore((s) => s.setUnits);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <div className={styles.settings}>
      <Segmented
        label={t.settings.language}
        size="s"
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'en', label: 'English' },
          { value: 'id', label: 'Indonesia' },
        ]}
      />
      <Segmented
        label={t.settings.units}
        size="s"
        value={units}
        onChange={setUnits}
        options={[
          { value: 'C', label: '°C' },
          { value: 'F', label: '°F' },
        ]}
      />
      <Segmented
        label={t.settings.theme}
        size="s"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: t.settings.themeSystem },
          { value: 'light', label: t.settings.themeLight },
          { value: 'dark', label: t.settings.themeDark },
        ]}
      />
    </div>
  );
}

function SettingsMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.menu} ref={root}>
      <button
        type="button"
        className={styles.iconButton}
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="sliders" />
        <span className="visually-hidden">{t.nav.menu}</span>
      </button>
      {open && (
        <div id="settings-panel" className={styles.panel} role="group" aria-label={t.nav.menu}>
          <SettingsControls />
        </div>
      )}
    </div>
  );
}

export function Header() {
  const t = useT();
  const place = useStore((s) => s.place);
  const [path] = useLocation();
  const [searching, setSearching] = useState(false);

  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.bar}`}>
        <Link href="/" className={styles.brand} aria-label="Terik">
          <LogoMark />
          <Wordmark />
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {ROUTES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={styles.navLink}
              aria-current={path === r.href ? 'page' : undefined}
            >
              {t.nav[r.key]}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <button type="button" className={styles.place} onClick={() => setSearching(true)}>
            <Icon name="search" size={18} />
            <span className={styles.placeName}>{place ? place.name : t.search.placeholder}</span>
            <span className="visually-hidden">{t.search.change}</span>
          </button>
          <SettingsMenu />
        </div>
      </div>
      <PlaceSearch open={searching} onClose={() => setSearching(false)} />
    </header>
  );
}

export function TabBar() {
  const t = useT();
  const [path] = useLocation();
  return (
    <nav className={styles.tabbar} aria-label="Main">
      {ROUTES.map((r) => (
        <Link key={r.href} href={r.href} className={styles.tab} aria-current={path === r.href ? 'page' : undefined}>
          <Icon name={r.icon} size={22} />
          <span>{t.nav[r.key]}</span>
        </Link>
      ))}
    </nav>
  );
}
