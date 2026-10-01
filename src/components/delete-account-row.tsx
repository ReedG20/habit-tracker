import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ArrowRight01Icon, Delete02Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';

/** Me's way to delete the account, in its own card below the settings. */
export function DeleteAccountRow() {
  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete account"
        onPress={() => router.push('/me/delete-account')}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Icon icon={Delete02Icon} size={22} themeColor="accent" />
        <ThemedText themeColor="accent" style={styles.label}>
          Delete account
        </ThemedText>
        <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  label: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
