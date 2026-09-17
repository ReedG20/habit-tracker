import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FormSheetActionsProps = {
  submitLabel: string;
  onSubmit: () => void;
};

/**
 * Liquid glass via `GlassView` (a UIVisualEffectView), not SwiftUI `Host`. A
 * SwiftUI host in the same sheet as RN `TextInput` steals first responder —
 * one keystroke, or a tap that never focuses the field.
 */
export function FormSheetActions({ submitLabel, onSubmit }: FormSheetActionsProps) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}>
        <Chrome glass={glass} backgroundColor={theme.backgroundElement}>
          <ThemedText type="smallBold">Cancel</ThemedText>
        </Chrome>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onSubmit}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <Chrome glass={glass} backgroundColor={theme.primary} tint={theme.primary}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            {submitLabel}
          </ThemedText>
        </Chrome>
      </Pressable>
    </View>
  );
}

function Chrome({
  glass,
  backgroundColor,
  tint,
  children,
}: {
  glass: boolean;
  backgroundColor: string;
  tint?: string;
  children: ReactNode;
}) {
  if (glass) {
    return (
      <View style={styles.chrome}>
        <GlassView
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.glass]}
          glassEffectStyle="regular"
          tintColor={tint}
        />
        {children}
      </View>
    );
  }

  return <View style={[styles.chrome, { backgroundColor }]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  side: {
    flexShrink: 0,
  },
  main: {
    flex: 1,
  },
  chrome: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    borderRadius: 24,
  },
  pressed: {
    opacity: 0.72,
  },
});
