import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { compute } from '../workers/client';
import { fetchEnsemble, fetchForecast, type Forecast, type Grid } from './openMeteo';
import { loadClimate, type ClimateData, type ClimateProgress } from './climate';
import { analyseClimate, type ClimateAnalysis } from '../lib/climate/analysis';
import type { Level, ProfileSettings } from '../lib/guidance/profiles';
import type { Place } from '../state/store';

const placeKey = (p: Place | null) => (p ? `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}` : 'none');

/** Identifies one climate record: the place and the surroundings it was computed for. */
export const climateKey = (place: Place | null, urban: boolean) => `${placeKey(place)}|${urban}`;

export function useForecast(place: Place | null) {
  return useQuery({
    queryKey: ['forecast', placeKey(place)],
    queryFn: ({ signal }) => fetchForecast(place!, signal),
    enabled: place !== null,
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useComputedForecast(forecast: Forecast | undefined, urban: boolean) {
  return useQuery({
    queryKey: ['computed', forecast?.grid.latitude, forecast?.grid.longitude, forecast?.fetchedAt, urban],
    queryFn: () => compute().forecast(forecast!, urban),
    enabled: forecast !== undefined,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function useEnsemble(place: Place | null) {
  return useQuery({
    queryKey: ['ensemble', placeKey(place)],
    queryFn: ({ signal }) => fetchEnsemble(place!, signal),
    enabled: place !== null,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
}

export function useEnsembleWbgt(place: Place | null, grid: Grid | undefined, urban: boolean) {
  const ensemble = useEnsemble(place);
  const computed = useQuery({
    queryKey: ['ensembleWbgt', placeKey(place), ensemble.data?.fetchedAt, grid?.elevation, urban],
    queryFn: () => compute().ensemble(ensemble.data!, grid!, urban),
    enabled: ensemble.data !== undefined && grid !== undefined,
    staleTime: Infinity,
  });
  return { ensemble, computed };
}

/**
 * checking: reading the device cache. idle: not saved here, nothing running.
 * loading: downloading (data, if any, is an older copy still worth showing).
 */
export type ClimateStatus = 'checking' | 'idle' | 'loading' | 'ready' | 'error' | 'empty';

/**
 * The hourly WBGT record for a place. With `autoFetch` false it never uses
 * the network, which is what the forecast page wants for context.
 */
interface ClimateSnapshot {
  /** Which load this belongs to; a snapshot from an older load only lends its data. */
  request: string;
  key: string;
  settled: boolean;
  status: ClimateStatus;
  data: ClimateData | null;
  progress: ClimateProgress | null;
}

export function useClimateData(place: Place | null, timeZone: string | undefined, urban: boolean, autoFetch: boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = climateKey(place, urban);
  const request = `${key}|${timeZone ?? ''}|${autoFetch}|${attempt}`;
  const [snap, setSnap] = useState<ClimateSnapshot>({
    request: '',
    key: '',
    settled: false,
    status: 'checking',
    data: null,
    progress: null,
  });

  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    // Only callbacks update state: progress as it comes, and the outcome at the end.
    const update = (patch: Partial<ClimateSnapshot>) =>
      setSnap((s) => {
        const sameKey = s.key === key;
        return {
          request,
          key,
          settled: false,
          status: s.status,
          data: sameKey ? s.data : null,
          progress: sameKey ? s.progress : null,
          ...patch,
        };
      });
    loadClimate({
      place,
      timeZone,
      urban,
      signal: controller.signal,
      cacheOnly: !autoFetch,
      onProgress: (progress) => {
        if (!controller.signal.aborted) update({ progress });
      },
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result === null) {
          update({ settled: true, status: 'idle' });
          return;
        }
        const usable = result.years.filter((y) => y.wbgt.some(Number.isFinite)).length;
        update({ settled: true, status: usable >= 20 ? 'ready' : 'empty', data: result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Climate record failed', error);
        update({ settled: true, status: 'error' });
      });
    return () => controller.abort();
    // `request` covers the key, time zone, mode and retries; `place` is read for its coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const sameKey = snap.key === key;
  const inFlight = snap.request !== request || !snap.settled;
  const status: ClimateStatus = inFlight ? (autoFetch ? 'loading' : 'checking') : snap.status;
  return {
    key,
    status,
    data: sameKey ? snap.data : null,
    progress: sameKey ? snap.progress : null,
    retry: () => setAttempt((n) => n + 1),
  };
}

export interface AnalysisRequest {
  settings: ProfileSettings;
  minLevel: Level;
}

export function periodsFor(lastCompleteYear: number) {
  return {
    baseline: { start: 1961, end: 1990 },
    recent: { start: lastCompleteYear - 29, end: lastCompleteYear },
  };
}

/** Climate statistics for the loaded record, recomputed off the main thread when the profile changes. */
export function useClimateAnalysis(data: ClimateData | null, request: AnalysisRequest) {
  const { settings, minLevel } = request;
  const input = useMemo(() => {
    if (!data) return null;
    const complete = data.years.filter((y) => y.year <= data.lastCompleteYear);
    const partial = data.years.find((y) => y.year === data.lastCompleteYear + 1) ?? null;
    return { complete, partial, periods: periodsFor(data.lastCompleteYear) };
  }, [data]);

  return useQuery<ClimateAnalysis>({
    queryKey: [
      'analysis',
      data?.grid.latitude,
      data?.grid.longitude,
      data?.loadedAt,
      settings.profile,
      settings.acclimatised,
      settings.clothing,
      settings.region,
      minLevel,
    ],
    queryFn: async () => {
      const { complete, partial, periods } = input!;
      const options = { settings, minLevel, ...periods };
      try {
        return await compute().analyse(complete, partial, options);
      } catch {
        // If the worker is unavailable, do it here; it takes well under a second.
        return analyseClimate(complete, partial, options);
      }
    },
    enabled: input !== null && input.complete.length >= 20,
    staleTime: Infinity,
    // Keep showing the last result while a new profile is worked out, but
    // never one that belongs to another place.
    placeholderData: (previous, previousQuery) =>
      data && previousQuery?.queryKey[1] === data.grid.latitude && previousQuery.queryKey[2] === data.grid.longitude
        ? previous
        : undefined,
  });
}
