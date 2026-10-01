import { usePathname } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

import { shouldApplyUpdate, UPDATE_CHECK_INTERVAL_MS } from '@/lib/app-version';

/**
 * Picks up OTA updates when the app comes back, not just on a cold start,
 * which iOS rarely gives a suspended app.
 *
 * Coming back checks for an update and downloads it in the background (at
 * most every few minutes). A downloaded update, from here or from launch, is
 * applied the next time the app comes back after a long absence, outside any
 * flow (`shouldApplyUpdate`); otherwise it waits for the next cold start, as
 * before.
 *
 * Best effort: a failed check or download is dropped silently and retried on
 * a later return. Does nothing in development, where updates are off.
 */
export function useForegroundUpdates(): void {
  const enabled = Updates.isEnabled && !__DEV__;
  const { isUpdatePending } = Updates.useUpdates();
  const pathname = usePathname();
  const lastCheckAt = useRef(0);
  const backgroundedAt = useRef<number | null>(null);

  const onForeground = useEffectEvent(async (awayMs: number) => {
    if (shouldApplyUpdate({ pending: isUpdatePending, awayMs, pathname })) {
      await Updates.reloadAsync();
      return;
    }
    if (isUpdatePending || Date.now() - lastCheckAt.current < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheckAt.current = Date.now();
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) await Updates.fetchUpdateAsync();
  });

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active' && backgroundedAt.current !== null) {
        const awayMs = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        onForeground(awayMs).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [enabled]);
}
