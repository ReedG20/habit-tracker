import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useThemePreference } from '@/lib/theme-preference';

const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();
  const preference = useThemePreference();

  if (hasHydrated) {
    return preference === 'system' ? colorScheme : preference;
  }

  return 'light';
}
