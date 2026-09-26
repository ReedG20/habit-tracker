import { useSyncExternalStore } from 'react';

/**
 * Tools for working on the app itself. Always in a debug build; in a preview
 * or TestFlight build only when `EXPO_PUBLIC_DEV_TOOLS=1` is set for it. The
 * ones that change data are also refused by the server unless the deployment
 * has `ANTE_DEV_OVERRIDES=1`, which production never does.
 */
export const showDevTools = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

/**
 * "Force delete": habits delete right away instead of after the period still
 * owed, and goals with money on them can be deleted. Kept in memory only, so
 * it is off again after every launch.
 */
let forceDelete = false;
const listeners = new Set<() => void>();

export function setForceDelete(value: boolean): void {
  forceDelete = value;
  listeners.forEach((listener) => listener());
}

export function useForceDelete(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => forceDelete,
  );
}
