import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { FlameIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import type { Streak } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';

export type StakesBannerProps = {
  /**
   * The re-entry fee, already formatted (`$9.99`). `undefined` while the store
   * is still answering; `null` when it has no price to give (web, or the
   * product is not live), which states the lock itself instead.
   */
  fee: string | null | undefined;
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
        {fee === null ? 'Skipping today' : 'Skipping today will cost you'}
      </ThemedText>
      <ThemedText style={styles.fee} themeColor="text">
        {fee === null ? 'locks Ante' : (fee ?? ' ')}
      </ThemedText>
      <ThemedText style={styles.caption} themeColor="text">
        {fee === null ? 'until you pay to get back in' : 'to get back in'}
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
