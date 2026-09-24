import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { ControlHeight, PillRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HOLD_MS = 1600;
const TICKS = [0.25, 0.5, 0.75];

export type HoldToConfirmButtonProps = {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Called when a disabled button is pressed, to say why nothing is happening. */
  onDisabledPress?: () => void;
};

/**
 * Fills left to right while held and fires once it's full. Letting go early
 * drains it, so locking in is always deliberate.
 */
export function HoldToConfirmButton({
  label,
  onConfirm,
  disabled = false,
  onDisabledPress,
}: HoldToConfirmButtonProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);

  const tick = () => void Haptics.selectionAsync();
  const confirm = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  useAnimatedReaction(
    () => progress.value,
    (current, previous) => {
      if (previous === null || current <= previous) return;
      for (const threshold of TICKS) {
        if (previous < threshold && current >= threshold) scheduleOnRN(tick);
      }
    },
  );

  const pressIn = () => {
    if (disabled) {
      onDisabledPress?.();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    progress.set(
      withTiming(
        1,
        { duration: HOLD_MS * (1 - progress.get()), easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(confirm);
        },
      ),
    );
  };

  const pressOut = () => {
    if (progress.get() >= 1) return;
    cancelAnimation(progress);
    progress.set(withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }));
  };

  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * width }));

  // The label is drawn twice: once on the track, once on the fill (clipped to
  // it), so each letter flips color as the fill passes under it.
  const labelLayer = (color: string) => (
    <View style={[styles.labelLayer, { width }]}>
      <ThemedText type="smallBold" style={[styles.label, { color }]}>
        {label}
      </ThemedText>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold until the bar fills"
      accessibilityState={{ disabled }}
      // VoiceOver users can't hold; a double tap confirms for them.
      onAccessibilityTap={disabled ? undefined : confirm}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        styles.track,
        { backgroundColor: theme.backgroundElement, borderColor: theme.primary },
        disabled && styles.disabled,
      ]}>
      {labelLayer(theme.primary)}
      <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]}>
        {labelLayer(theme.onPrimary)}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    height: ControlHeight,
    borderRadius: PillRadius,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  labelLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.45,
  },
});
