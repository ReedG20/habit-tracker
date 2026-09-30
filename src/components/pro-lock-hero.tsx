import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Note } from '@/components/commitment/note';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { INK_DARK } from '@/components/today-hero';
import { LockKeyholeIcon, SparklesIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { proLockHeroCopy, type ProLockInput } from '@/data/pro-lock';
import { splitEmphasis } from '@/data/today-moment';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { openPaywall } from '@/lib/paywall';

/**
 * The top of Today without Ante Pro, when no goal has a moment to lead with.
 * Built like `TodayHero` (kicker, big line, caption, the coach's note) so the
 * screen keeps its shape; the big line is the lock instead of a number.
 */
export function ProLockHero(input: ProLockInput) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const ink = scheme === 'dark' ? INK_DARK : theme.primary;
  const copy = proLockHeroCopy(input);

  return (
    <View style={styles.hero}>
      <View
        accessible
        accessibilityLabel={[copy.kicker, copy.headline, copy.sentence, copy.note].join(' ')}
        style={styles.story}>
        {/* One line, riding above the kicker: the headline runs full width. */}
        <Note style={[styles.note, { color: ink }]} numberOfLines={1}>
          {copy.note}
        </Note>

        <View style={styles.kicker}>
          <Icon icon={LockKeyholeIcon} size={20} strokeWidth={2} color={ink} />
          <ThemedText type="smallSemibold" style={[styles.kickerText, { color: ink }]}>
            {copy.kicker}
          </ThemedText>
        </View>

        <ThemedText style={styles.headline} themeColor="text">
          {copy.headline}
        </ThemedText>
        <ThemedText style={styles.caption} themeColor="text">
          {splitEmphasis(copy.sentence, copy.emphasis).map((run, index) =>
            run.bold ? (
              <Text key={index} style={styles.emphasis}>
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )}
        </ThemedText>
      </View>

      <ActionButton
        label={copy.actionLabel}
        icon={SparklesIcon}
        variant="primary"
        onPress={() => openPaywall('today_card')}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignSelf: 'stretch',
    gap: Spacing.four,
  },
  story: {
    gap: Spacing.two,
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  kickerText: {
    flexShrink: 1,
  },
  // Comico sits high in its line box; the tall box keeps its tops unclipped.
  headline: {
    fontFamily: Fonts.wisdom,
    fontSize: 44,
    lineHeight: 54,
  },
  caption: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 500,
    maxWidth: 320,
  },
  emphasis: {
    fontWeight: 700,
  },
  note: {
    position: 'absolute',
    top: -(Spacing.four + Spacing.two),
    right: Spacing.two,
    left: Spacing.five,
    textAlign: 'right',
    transform: [{ rotate: '5deg' }],
    zIndex: 1,
  },
  action: {
    alignSelf: 'flex-start',
  },
});
