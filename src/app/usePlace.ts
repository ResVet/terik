import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { searchPlaces } from '../data/openMeteo';
import { useStore, type Place } from '../state/store';

const FALLBACK: Place = {
  name: 'Jakarta',
  admin: 'DKI Jakarta',
  country: 'Indonesia',
  countryCode: 'ID',
  latitude: -6.2146,
  longitude: 106.8451,
  elevation: 8,
  timezone: 'Asia/Jakarta',
};

function placeFromUrl(): Place | null {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const name = params.get('place')?.slice(0, 80) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  const tz = params.get('tz') ?? undefined;
  return { name, latitude: lat, longitude: lon, timezone: tz && tz.length < 60 ? tz : undefined };
}

/** A sensible first place without asking for location: the city in the device's time zone name. */
async function placeFromTimeZone(language: string): Promise<Place> {
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return FALLBACK;
  }
  const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? '';
  if (!zone.includes('/') || zone.startsWith('Etc/') || city.length < 3) return FALLBACK;
  try {
    const results = await searchPlaces(city, language);
    const match = results.find((r) => r.timezone === zone) ?? results[0];
    return match ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function searchFor(place: Place): string {
  const params = new URLSearchParams({
    place: place.name,
    lat: place.latitude.toFixed(4),
    lon: place.longitude.toFixed(4),
  });
  if (place.timezone) params.set('tz', place.timezone);
  return `?${params}`;
}

/** Pick the starting place and keep the address bar shareable. */
export function usePlaceBootstrap(): void {
  const place = useStore((s) => s.place);
  const setPlace = useStore((s) => s.setPlace);
  const language = useStore((s) => s.language);
  const [path] = useLocation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromUrl = placeFromUrl();
    if (fromUrl) {
      const known = useStore
        .getState()
        .recent.find(
          (p) => Math.abs(p.latitude - fromUrl.latitude) < 0.01 && Math.abs(p.longitude - fromUrl.longitude) < 0.01,
        );
      setPlace(known ?? fromUrl);
      return;
    }
    if (!useStore.getState().place) {
      void placeFromTimeZone(language).then((p) => {
        if (!useStore.getState().place) setPlace(p);
      });
    }
  }, [language, setPlace]);

  // Runs on every route change too, so links between pages keep the place in the address.
  useEffect(() => {
    if (!place) return;
    const next = `${window.location.pathname}${searchFor(place)}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [place, path]);
}

export function placeLabel(place: Place): string {
  return [place.name, place.admin && place.admin !== place.name ? place.admin : null, place.country]
    .filter(Boolean)
    .join(', ');
}
