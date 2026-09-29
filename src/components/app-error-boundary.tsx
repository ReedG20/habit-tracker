import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureError } from '@/lib/analytics';

/**
 * What a render crash shows instead of a red screen, exported as the root
 * layout's `ErrorBoundary`. It replaces the whole tree, providers included, so
 * it leans on nothing but the theme. The crash is reported to PostHog, which
 * autocapture misses: React catches render errors before they go uncaught.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();

  useEffect(() => {
    captureError(error, 'render');
  }, [error]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle" style={styles.centered}>
        Something went wrong
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        It&apos;s been reported. Try again, and if it keeps happening, restart the app.
      </ThemedText>
      <ActionButton label="Try again" variant="primary" onPress={() => void retry()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
});
