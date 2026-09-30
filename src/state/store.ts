import { create } from 'zustand';
import { DEFAULT_SETTINGS, PROFILES, type ProfileSettings } from '../lib/guidance/profiles';
import type { Clothing } from '../lib/guidance/niosh';
import type { SportRegion } from '../lib/guidance/sport';

export interface Place {
  name: string;
  /** Province or state. */
  admin?: string | undefined;
  country?: string | undefined;
  countryCode?: string | undefined;
  latitude: number;
  longitude: number;
  elevation?: number | undefined;
  timezone?: string | undefined;
}

export type Units = 'C' | 'F';
export type Language = 'en' | 'id';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface RegionInfo {
  /** placeKey() of the place the record belongs to. */
  key: string;
  /** 90th percentile of warm-season daily peaks, °C. */
  p90: number;
  region: SportRegion;
}

interface Persisted {
  place: Place | null;
  settings: ProfileSettings;
  /** Region category was set by hand rather than taken from climate data. */
  regionPinned: boolean;
  /** Region category measured from the local climate record, if one was built. */
  regionInfo: RegionInfo | null;
  urban: boolean;
  units: Units;
  language: Language;
  theme: ThemeChoice;
  recent: Place[];
}

interface Store extends Persisted {
  setPlace: (place: Place) => void;
  setSettings: (patch: Partial<ProfileSettings>) => void;
  setRegion: (region: SportRegion, pinned: boolean) => void;
  setRegionInfo: (info: RegionInfo) => void;
  setUrban: (urban: boolean) => void;
  setUnits: (units: Units) => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeChoice) => void;
}

const KEY = 'terik:v1';

/** Stable key for a place, about 1 km of rounding. */
export function placeKeyOf(place: Place): string {
  return `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
}

function detectLanguage(): Language {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    return langs.some((l) => /^(id|ms)\b/i.test(l)) ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

function detectUnits(): Units {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region && ['US', 'LR', 'MM', 'PW', 'FM', 'MH', 'KY', 'BS', 'BZ'].includes(region) ? 'F' : 'C';
  } catch {
    return 'C';
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validPlace(p: unknown): p is Place {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.name === 'string' &&
    isNumber(o.latitude) &&
    isNumber(o.longitude) &&
    Math.abs(o.latitude) <= 90 &&
    Math.abs(o.longitude) <= 180
  );
}

function validRegionInfo(v: unknown): v is RegionInfo {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === 'string' && isNumber(o.p90) && (o.region === 1 || o.region === 2 || o.region === 3);
}

const CLOTHING: readonly Clothing[] = [
  'workClothes',
  'clothCoveralls',
  'smsCoveralls',
  'polyolefinCoveralls',
  'doubleLayer',
  'vapourBarrier',
];

function load(): Persisted {
  const fallback: Persisted = {
    place: null,
    settings: DEFAULT_SETTINGS,
    regionPinned: false,
    regionInfo: null,
    urban: true,
    units: detectUnits(),
    language: detectLanguage(),
    theme: 'system',
    recent: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Persisted>;
    const s = data.settings;
    const settings: ProfileSettings = {
      profile: s && PROFILES.includes(s.profile) ? s.profile : DEFAULT_SETTINGS.profile,
      acclimatised: typeof s?.acclimatised === 'boolean' ? s.acclimatised : DEFAULT_SETTINGS.acclimatised,
      clothing: s && CLOTHING.includes(s.clothing) ? s.clothing : DEFAULT_SETTINGS.clothing,
      region: s && [1, 2, 3].includes(s.region) ? s.region : DEFAULT_SETTINGS.region,
    };
    return {
      place: validPlace(data.place) ? data.place : null,
      settings,
      regionPinned: data.regionPinned === true,
      regionInfo: validRegionInfo(data.regionInfo) ? data.regionInfo : null,
      urban: typeof data.urban === 'boolean' ? data.urban : true,
      units: data.units === 'F' || data.units === 'C' ? data.units : fallback.units,
      language: data.language === 'id' || data.language === 'en' ? data.language : fallback.language,
      theme: data.theme === 'light' || data.theme === 'dark' || data.theme === 'system' ? data.theme : 'system',
      recent: Array.isArray(data.recent) ? data.recent.filter(validPlace).slice(0, 6) : [],
    };
  } catch {
    return fallback;
  }
}

function save(state: Persisted) {
  try {
    const { place, settings, regionPinned, regionInfo, urban, units, language, theme, recent } = state;
    localStorage.setItem(
      KEY,
      JSON.stringify({ place, settings, regionPinned, regionInfo, urban, units, language, theme, recent }),
    );
  } catch {
    // Private mode or storage disabled: settings simply last for this visit.
  }
}

const samePlace = (a: Place, b: Place) =>
  Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

export const useStore = create<Store>((set, get) => ({
  ...load(),
  setPlace: (place) => {
    const recent = [place, ...get().recent.filter((p) => !samePlace(p, place))].slice(0, 6);
    set({ place, recent });
  },
  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
  setRegion: (region, pinned) => set({ settings: { ...get().settings, region }, regionPinned: pinned }),
  setRegionInfo: (info) => {
    const state = get();
    const current = state.place ? placeKeyOf(state.place) : null;
    if (!state.regionPinned && current === info.key) {
      set({ regionInfo: info, settings: { ...state.settings, region: info.region } });
    } else {
      set({ regionInfo: info });
    }
  },
  setUrban: (urban) => set({ urban }),
  setUnits: (units) => set({ units }),
  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
}));

useStore.subscribe((state) => save(state));
