import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const STEP_COUNT = 3;

export type StepProgressProps = {
  /** 1-based: the step on screen counts as filled. */
  step: number;
};

export function StepProgress({ step }: StepProgressProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${STEP_COUNT}`}>
      {Array.from({ length: STEP_COUNT }, (_, index) => (
        <Segment key={index} filled={index < step} />
      ))}
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const theme = useTheme();
  const fill = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, { duration: 320 });
  }, [fill, filled]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
      <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: PillRadius,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: PillRadius,
  },
});
