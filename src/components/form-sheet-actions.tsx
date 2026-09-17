import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FormSheetActionsProps = {
  submitLabel: string;
  onSubmit: () => void;
};

/** Fallback actions for Android and web. */
export function FormSheetActions({ submitLabel, onSubmit }: FormSheetActionsProps) {
  const theme = useTheme();

  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.button,
          { borderColor: theme.border, borderWidth: 1 },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Cancel
        </ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.button,
          styles.submit,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
          {submitLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: BorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submit: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
