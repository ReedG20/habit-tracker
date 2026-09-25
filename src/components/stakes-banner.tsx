import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { FlameIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import type { Streak } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

export type StakesBannerProps = {
  /** Already formatted, e.g. `$24.62`. */
  fee: string;
  /** `undefined` while the habits are still loading. */
  streak: Streak | undefined;
};

/** "1 day streak", "3 week streak". */
function describeStreak({ count, unit }: Streak): string {
  return `${count} ${unit} streak`;
}

/** The stakes, front and center: what a skipped day costs, and the run at risk. */
export function StakesBanner({ fee, streak }: StakesBannerProps) {
  const theme = useTheme();

  return (
    <View style={styles.banner}>
      <ThemedText style={styles.caption} themeColor="text">
        Skipping today will cost you
      </ThemedText>
      <ThemedText style={styles.fee} themeColor="text">
        {fee}
      </ThemedText>
      <ThemedText style={styles.caption} themeColor="text">
        to unfreeze your account
      </ThemedText>

      <View
        accessibilityLabel={streak === undefined ? undefined : describeStreak(streak)}
        style={styles.streak}>
        <Icon icon={FlameIcon} size={20} color={theme.accent} fill={theme.accent} />
        <ThemedText type="smallSemibold" themeColor="text">
          {streak === undefined ? ' ' : describeStreak(streak)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
  },
  caption: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
    textAlign: 'center',
  },
  // Comico sits high in its line box: a tight box clips the tops of the
  // digits, so the box stays tall and the margins even out the gaps instead.
  fee: {
    fontFamily: Fonts.wisdom,
    fontSize: 64,
    lineHeight: 76,
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
    textAlign: 'center',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
});
