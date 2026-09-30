import { useMemo } from 'react';
import { useStore, type Language, type Units } from '../state/store';
import { zonedParts } from '../lib/time/zone';
import { en, type Dictionary } from './en';
import { id } from './id';

const dictionaries: Record<Language, Dictionary> = { en, id };

export function useT(): Dictionary {
  const language = useStore((s) => s.language);
  return dictionaries[language];
}

function localeFor(language: Language): string {
  if (language === 'id') return 'id-ID';
  try {
    const nav = navigator.language;
    if (/^en\b/i.test(nav)) return nav;
  } catch {
    // Fall through to a neutral English locale.
  }
  return 'en-GB';
}

export interface Formatter {
  locale: string;
  units: Units;
  /** Temperature, converted to the chosen unit: "31.4°". */
  temp: (celsius: number, digits?: number) => string;
  /** Temperature with the unit letter: "31.4 °C". */
  tempUnit: (celsius: number, digits?: number) => string;
  /** A temperature difference, converted without the offset. */
  delta: (celsius: number, digits?: number, signed?: boolean) => string;
  number: (value: number, digits?: number) => string;
  integer: (value: number) => string;
  percent: (fraction: number) => string;
  /** 24-hour wall-clock time in the given zone. */
  time: (utcMs: number, timeZone: string) => string;
  hour: (utcMs: number, timeZone: string) => string;
  weekday: (utcMs: number, timeZone: string, style?: 'short' | 'long') => string;
  date: (utcMs: number, timeZone: string) => string;
  dayLabel: (utcMs: number, timeZone: string, nowMs: number) => string;
  unitSymbol: string;
}

export function useFormat(): Formatter {
  const language = useStore((s) => s.language);
  const units = useStore((s) => s.units);
  const t = dictionaries[language];
  return useMemo(() => {
    const locale = localeFor(language);
    const fixed = (digits: number) =>
      new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const cache = new Map<number, Intl.NumberFormat>();
    const num = (value: number, digits: number) => {
      if (!Number.isFinite(value)) return '-';
      let f = cache.get(digits);
      if (!f) {
        f = fixed(digits);
        cache.set(digits, f);
      }
      return f.format(value === 0 ? 0 : value);
    };
    const toUnit = (c: number) => (units === 'F' ? c * 1.8 + 32 : c);
    const unitSymbol = units === 'F' ? '°F' : '°C';
    const timeFormatters = new Map<string, Intl.DateTimeFormat>();
    const dtf = (key: string, timeZone: string, options: Intl.DateTimeFormatOptions) => {
      const k = `${key}|${timeZone}`;
      let f = timeFormatters.get(k);
      if (!f) {
        try {
          f = new Intl.DateTimeFormat(locale, { ...options, timeZone });
        } catch {
          f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
        }
        timeFormatters.set(k, f);
      }
      return f;
    };
    const pad = (n: number) => String(n).padStart(2, '0');
    const sep = language === 'id' ? '.' : ':';
    return {
      locale,
      units,
      unitSymbol,
      temp: (c, digits = 1) => `${num(toUnit(c), digits)}°`,
      tempUnit: (c, digits = 1) => `${num(toUnit(c), digits)} ${unitSymbol}`,
      delta: (c, digits = 1, signed = false) => {
        const v = units === 'F' ? c * 1.8 : c;
        const s = num(Math.abs(v), digits);
        const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
        return `${sign}${s} ${unitSymbol}`;
      },
      number: (v, digits = 0) => num(v, digits),
      integer: (v) => num(Math.round(v), 0),
      percent: (f) => `${num(f * 100, 0)}%`,
      time: (ms, tz) => {
        const p = zonedParts(ms, tz);
        return `${pad(p.hour)}${sep}${pad(p.minute)}`;
      },
      hour: (ms, tz) => pad(zonedParts(ms, tz).hour),
      weekday: (ms, tz, style = 'short') => dtf(`wd-${style}`, tz, { weekday: style }).format(ms),
      date: (ms, tz) => dtf('date', tz, { day: 'numeric', month: 'short' }).format(ms),
      dayLabel: (ms, tz, nowMs) => {
        const a = zonedParts(ms, tz);
        const b = zonedParts(nowMs, tz);
        const dayIndex = (p: typeof a) => Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
        const diff = dayIndex(a) - dayIndex(b);
        if (diff === 0) return t.common.today;
        if (diff === 1) return t.common.tomorrow;
        return dtf('wd-long', tz, { weekday: 'long' }).format(ms);
      },
    } satisfies Formatter;
  }, [language, units, t]);
}
