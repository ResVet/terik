import { useCallback, useSyncExternalStore } from 'react';

/** Live result of a CSS media query; false during server rendering. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', callback);
      return () => list.removeEventListener('change', callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
export const useCoarsePointer = () => useMedia('(pointer: coarse)');
