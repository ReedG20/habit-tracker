import { StyleSheet, View } from 'react-native';

import { PillRadius, Spacing } from '@/constants/theme';
import { progressSteps, type ProgressStep } from '@/data/onboarding';
import { useTheme } from '@/hooks/use-theme';

/** One capsule per step, filled up to and including the current one. */
export function OnboardingProgress({ step }: { step: ProgressStep }) {
  const theme = useTheme();
  const index = progressSteps.indexOf(step);

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: progressSteps.length, now: index + 1 }}>
      {progressSteps.map((name, i) => (
        <View
          key={name}
          style={[
            styles.segment,
            { backgroundColor: i <= index ? theme.primary : theme.backgroundSelected },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: PillRadius,
  },
});
