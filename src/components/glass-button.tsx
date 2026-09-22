import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import type { ActionButtonProps } from './action-button.types';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { ButtonHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const REGULAR_HEIGHT = ButtonHeight;
const SMALL_HEIGHT = 36;

/**
 * Glass via `GlassView` (a UIVisualEffectView) rather than a SwiftUI button:
 * for sheets that also hold an RN `TextInput`, where a SwiftUI host would
 * steal first responder — one keystroke, or a tap that never focuses the
 * field. Everywhere else prefer `ActionButton`. Off iOS 26 (and on Android
 * and web) this falls back to solid chrome; `GlassView` is a plain `View`
 * there, so one file covers every platform.
 */
export function GlassButton({
  label,
  onPress,
  variant = 'neutral',
  size = 'regular',
  icon,
  fill: _fill,
  disabled = false,
  accessibilityLabel,
  style,
}: ActionButtonProps) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const height = size === 'small' ? SMALL_HEIGHT : REGULAR_HEIGHT;

  const textColor =
    variant === 'primary' ? theme.onPrimary : variant === 'destructive' ? theme.accent : theme.text;

  const fallback: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: theme.primary }
      : variant === 'destructive'
        ? { borderWidth: 1, borderColor: theme.border }
        : { backgroundColor: theme.backgroundElement };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, (pressed || disabled) && styles.pressed]}>
      <View
        style={[
          styles.chrome,
          size === 'small' ? styles.small : styles.regular,
          { borderRadius: height / 2 },
          glass ? styles.glassChrome : fallback,
        ]}>
        {glass ? (
          <GlassView
            pointerEvents="none"
            // UIKit takes the radius literally rather than clamping it to the
            // view, so the capsule has to be spelled out as half the height.
            style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]}
            glassEffectStyle="regular"
            tintColor={variant === 'primary' ? theme.primary : undefined}
          />
        ) : null}
        {icon ? <Icon icon={icon} size={size === 'small' ? 18 : 20} color={textColor} /> : null}
        <ThemedText type="smallSemibold" style={{ color: textColor }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  regular: {
    minHeight: REGULAR_HEIGHT,
    paddingHorizontal: Spacing.four,
  },
  small: {
    minHeight: SMALL_HEIGHT,
    paddingHorizontal: Spacing.three,
  },
  // A transparent chrome so the glass, not a solid fill, is what tints.
  glassChrome: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.72,
  },
});
