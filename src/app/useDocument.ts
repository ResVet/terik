import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { useStore } from '../state/store';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribeSystem(callback: () => void) {
  const q = darkQuery();
  q.addEventListener('change', callback);
  return () => q.removeEventListener('change', callback);
}

/** The theme actually on screen, following the system when the choice is "system". */
export function useResolvedTheme(): 'light' | 'dark' {
  const choice = useStore((s) => s.theme);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => darkQuery().matches,
    () => false,
  );
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

/** Keep <html> attributes, title and description in step with the settings. */
export function useDocumentSettings(): void {
  const theme = useStore((s) => s.theme);
  const language = useStore((s) => s.language);
  const t = useT();
  const [path] = useLocation();
  // Each page gets its own title, so tabs, bookmarks and screen readers can tell them apart.
  const title =
    path === '/climate' ? `${t.nav.climate} · Terik` : path === '/method' ? `${t.nav.method} · Terik` : t.meta.title;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description);
  }, [language, t, title]);
}
