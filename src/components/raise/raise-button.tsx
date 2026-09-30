import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ArrowRight01Icon, ArrowUpDoubleIcon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import type { Id } from '@/convex/_generated/dataModel';
import { raiseOptions } from '@/convex/lib/stakeLadder';
import type { StakeView } from '@/convex/lib/stakeRules';
import { raiseHint } from '@/data/raise';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';

const ICON_TILE = 36;

export type RaiseButtonProps = {
  target: { habitId: Id<'habits'> } | { goalId: Id<'goals'> };
  stake: StakeView | null;
  /** Still running: not broken, ending, done or at its deadline. */
  open: boolean;
};

/**
 * "Up the ante" right under a commitment's terms, as a card of its own that
 * says what's above the stake there now. Hidden without Pro, once the stake
 * came due, and when there's nothing higher left.
 */
export function RaiseButton({ target, stake, open }: RaiseButtonProps) {
  const theme = useTheme();
  const subscription = useSubscription();
  const commitment = 'habitId' in target ? 'habit' : 'goal';
  const options = raiseOptions(stake, commitment);
  // Riding, or holding nothing (none, or a friend who opted out): anything else already came due.
  const settled = stake !== null && stake.status !== 'armed' && stake.status !== 'void';
  if (!subscription.isPro || !open || settled || !options.canRaise) {
    return null;
  }
  const hint = raiseHint(stake, options);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Up the ante"
      accessibilityHint={hint}
      onPress={() => router.push({ pathname: '/raise', params: { ...target, source: 'detail' } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.iconTile, { backgroundColor: theme.primary }]}>
        <Icon icon={ArrowUpDoubleIcon} size={20} strokeWidth={2} color={theme.onPrimary} />
      </View>
      <View style={styles.body}>
        <ThemedText type="smallBold" themeColor="primary" style={styles.title}>
          Up the ante
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: CardRadius,
    padding: Spacing.three,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: ICON_TILE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.7,
  },
});
