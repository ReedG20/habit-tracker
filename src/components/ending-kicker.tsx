import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { CheckmarkCircle02Icon, HourglassIcon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import type { EndingStatus } from '@/data/ending';

export type EndingKickerProps = {
  ending: EndingStatus;
  /** Today is logged: goes grey like the rest of a logged card. */
  quiet?: boolean;
};

/**
 * "Ending · 5 days left" with an hourglass, above a habit card's title. Quiet
 * once today is logged, and a check once the last log is in.
 */
export function EndingKicker({ ending, quiet = false }: EndingKickerProps) {
  const tone = ending.finished || quiet ? 'textSecondary' : 'accent';
  return (
    <View style={styles.kicker}>
      <Icon
        icon={ending.finished ? CheckmarkCircle02Icon : HourglassIcon}
        size={16}
        strokeWidth={2}
        themeColor={tone}
      />
      <ThemedText type="smallSemibold" themeColor={tone}>
        {ending.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
