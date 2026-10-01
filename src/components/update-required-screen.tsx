import { useEffect } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import type { UpdateRequired } from '@/hooks/use-update-required';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { APP_STORE_URL } from '@/lib/app-version';

/**
 * What a build below `MIN_IOS_BUILD` shows instead of the app
 * (`useUpdateRequired`). There's no way past it but the App Store.
 */
export function UpdateRequiredScreen({ build, minimum }: UpdateRequired) {
  const theme = useTheme();

  useEffect(() => {
    track('update required shown', { build, minimum });
  }, [build, minimum]);

  const update = () => {
    track('update required tapped', { build, minimum });
    Linking.openURL(APP_STORE_URL).catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle" style={styles.centered}>
        Time to update
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        This version of Ante is no longer supported. Update from the App Store to keep going.
      </ThemedText>
      <ActionButton label="Update" variant="primary" onPress={update} />
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
