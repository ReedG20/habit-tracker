import { usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { trackScreen } from '@/lib/analytics';

/**
 * Sends a screen view on every route change. Expo Router hides the navigation
 * container PostHog's own screen autocapture needs, so it's done by hand.
 *
 * The name is the route pattern with groups dropped (`lost/[stakeId]`, not
 * `(app)/lost/k57…`), so every stake's loss screen counts as one screen; the
 * concrete path rides along as a property. Nothing is sent until `ready`,
 * while the splash screen still hides an empty navigator.
 */
export function useScreenTracking(ready: boolean): void {
  const segments = useSegments();
  const pathname = usePathname();
  // No segments yet is the root redirect deciding where to go, not a screen.
  const name = segments.filter((segment) => !segment.startsWith('(')).join('/');

  useEffect(() => {
    if (ready && name !== '') trackScreen(name, pathname);
  }, [ready, name, pathname]);
}
