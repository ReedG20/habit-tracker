import { useQuery } from 'convex/react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { StakeView } from '@/convex/lib/stakeRules';

/**
 * Under "the deal" once its money was charged: the way to tell us the charge
 * was wrong (`/contest/[stakeId]`), and where that stands once it's sent.
 */
export function ContestChargeLink({ stake }: { stake: StakeView | null | undefined }) {
  const charged = stake?.kind === 'money' && stake.status === 'charged';
  const review = useQuery(api.chargeReviews.forStake, charged ? { stakeId: stake._id } : 'skip');
  if (!charged || review === undefined) return null;

  const label =
    review === null
      ? 'Something wrong, or did something come up?'
      : review.status === 'open'
        ? 'Charge under review. We’ll get back to you.'
        : 'See what we found about this charge';
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/contest/${stake._id}` as Href)}
      hitSlop={Spacing.two}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  text: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
