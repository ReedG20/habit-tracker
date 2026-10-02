import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Note } from '@/components/commitment/note';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { INK_DARK } from '@/components/today-hero';
import { Add01Icon, GoalListIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { splitEmphasis } from '@/data/today-moment';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

const KICKER = 'Nothing on the line yet';
const HEADLINE = 'Put something on it.';
const SENTENCE =
  'Back a habit or goal with money, a friend, or your word. Whatever’s riding on today shows up here.';
const EMPHASIS = ['money, a friend, or your word'];
const NOTE = 'no stakes, no point.';

/**
 * The top of Today with no commitments to argue from. Built like
 * `ProLockHero` (kicker, big line, caption, the coach's note) so the screen
 * keeps its shape, with the way to make the first one right under it.
 */
export function TodayStartHero() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const ink = scheme === 'dark' ? INK_DARK : theme.primary;

  return (
    <View style={styles.hero}>
      <View
        accessible
        accessibilityLabel={[KICKER, HEADLINE, SENTENCE, NOTE].join(' ')}
        style={styles.story}>
        {/* One line, riding above the kicker: the headline runs full width. */}
        <Note style={[styles.note, { color: ink }]} numberOfLines={1}>
          {NOTE}
        </Note>

        <View style={styles.kicker}>
          <Icon icon={GoalListIcon} size={20} strokeWidth={2} color={theme.textSecondary} />
          <ThemedText type="smallSemibold" style={styles.kickerText} themeColor="textSecondary">
            {KICKER}
          </ThemedText>
        </View>

        <ThemedText style={styles.headline} themeColor="text">
          {HEADLINE}
        </ThemedText>
        <ThemedText style={styles.caption} themeColor="text">
          {splitEmphasis(SENTENCE, EMPHASIS).map((run, index) =>
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
        label="New commitment"
        icon={Add01Icon}
        variant="primary"
        onPress={() => router.push('/new')}
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
