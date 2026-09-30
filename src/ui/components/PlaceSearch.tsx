import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { reverseGeocode, searchPlaces, type PlaceResult } from '../../data/openMeteo';
import { useT } from '../../i18n';
import { useStore, type Place } from '../../state/store';
import { Icon } from './Icon';
import styles from './PlaceSearch.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

function describe(p: Place): string {
  return [p.admin, p.country].filter(Boolean).join(', ');
}

/** Place search in a modal dialog: type-ahead over Open-Meteo's geocoder, recent places, and "use my location". */
export function PlaceSearch({ open, onClose }: Props) {
  const t = useT();
  const language = useStore((s) => s.language);
  const recent = useStore((s) => s.recent);
  const setPlace = useStore((s) => s.setPlace);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<'idle' | 'searching' | 'error' | 'empty'>('idle');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Start fresh every time the dialog opens (adjusted while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setResults([]);
      setActive(-1);
      setState('idle');
      setLocateError(null);
    }
  }

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Searches start at two characters; below that the list shows recent places.
  const tooShort = query.trim().length < 2;
  const status = tooShort ? 'idle' : state;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const id = setTimeout(() => {
      setState('searching');
      searchPlaces(q, language, controller.signal)
        .then((r) => {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setState(r.length ? 'idle' : 'empty');
        })
        .catch(() => {
          if (!controller.signal.aborted) setState('error');
        });
    }, 220);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query, language]);

  const choose = (place: Place) => {
    setPlace(place);
    onClose();
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocateError(t.search.locateFailed);
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let named: Partial<Place> = {};
        try {
          named = await reverseGeocode(latitude, longitude, language);
        } catch {
          // A place without a name still works; the coordinates label it.
        }
        setLocating(false);
        let timezone: string | undefined;
        try {
          // The device is where the person is, so its zone is the place's zone.
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
        } catch {
          timezone = undefined;
        }
        choose({
          name: named.name ?? t.search.myLocation,
          admin: named.admin,
          country: named.country,
          countryCode: named.countryCode,
          latitude,
          longitude,
          timezone,
        });
      },
      (error) => {
        setLocating(false);
        setLocateError(error.code === error.PERMISSION_DENIED ? t.search.locateDenied : t.search.locateFailed);
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  };

  const list = tooShort ? [] : results;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + list.length) % list.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(list[active]!);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={t.search.label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.field}>
          <Icon name="search" size={20} className={styles.fieldIcon} />
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={list.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && list[active] ? `${listId}-${active}` : undefined}
            aria-label={t.search.label}
            placeholder={t.search.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className={styles.close} onClick={onClose} aria-label={t.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <button type="button" className={styles.locate} onClick={locate} disabled={locating}>
          <Icon name="locate" size={18} />
          <span>{locating ? t.search.locating : t.search.locate}</span>
        </button>
        {locateError && (
          <p className={styles.message} role="alert">
            {locateError}
          </p>
        )}

        <ul id={listId} role="listbox" className={styles.list} aria-label={t.search.label}>
          {list.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.item}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p)}
            >
              <span className={styles.name}>{p.name}</span>
              <span className={styles.meta}>{describe(p)}</span>
            </li>
          ))}
        </ul>

        {status === 'searching' && list.length === 0 && <p className={styles.message}>{t.common.loading}</p>}
        {status === 'empty' && <p className={styles.message}>{t.search.noResults}</p>}
        {status === 'error' && (
          <p className={styles.message} role="alert">
            {t.search.error}
          </p>
        )}

        {query.trim().length < 2 && recent.length > 0 && (
          <div className={styles.recent}>
            <p className="kicker">{t.search.recent}</p>
            <ul className={styles.recentList}>
              {recent.map((p) => (
                <li key={`${p.latitude},${p.longitude}`}>
                  <button type="button" className={styles.recentItem} onClick={() => choose(p)}>
                    <span className={styles.name}>{p.name}</span>
                    <span className={styles.meta}>{describe(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </dialog>
  );
}
