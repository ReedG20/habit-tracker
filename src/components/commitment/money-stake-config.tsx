import { Pressable, StyleSheet, View } from 'react-native';

import { reuseForStake, type CommitmentDraft } from './draft';
import { StakeAmountPicker } from './stake-amount-picker';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CheckmarkCircle02Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/lib/money';

export type MoneyStakeConfigProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  disabled?: boolean;
  /** What's already on the line elsewhere, and the most there can be; `null` while loading. */
  headroom: { usedCents: number; capCents: number; remainingCents: number } | null;
  /**
   * Raising money that's already on the commitment: what's there now. It's
   * already counted in `headroom`, it's the floor, and the card stays the same.
   */
  raisingFrom?: { amountCents: number; cardLabel: string; minCents: number };
  /** Raising from another kind: the least that counts as a raise. */
  minCents?: number;
};

/**
 * The amount, held under the cap on money at risk, and, when restarting, the
 * card the last stake was on, so going again doesn't mean typing it again.
 */
export function MoneyStakeConfig({
  draft,
  onChange,
  disabled,
  headroom,
  raisingFrom,
  minCents,
}: MoneyStakeConfigProps) {
  const theme = useTheme();
  const reuse = reuseForStake(draft);
  const already = raisingFrom?.amountCents ?? 0;
  const maxCents = headroom === null ? undefined : headroom.remainingCents + already;

  return (
    <View style={styles.config}>
      <StakeAmountPicker
        amountCents={draft.amountCents}
        onChange={(amountCents) => onChange({ amountCents })}
        disabled={disabled}
        maxCents={maxCents}
        minCents={raisingFrom?.minCents ?? minCents}
      />

      {headroom !== null && headroom.usedCents - already > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {formatCents(headroom.usedCents - already + draft.amountCents)} of{' '}
          {formatCents(headroom.capCents)} on the line with this one.
        </ThemedText>
      ) : null}

      {raisingFrom !== undefined ? (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} themeColor="primary" />
          <View style={styles.cardText}>
            <ThemedText type="smallSemibold">
              Up from {formatCents(raisingFrom.amountCents)}, same card
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {raisingFrom.cardLabel}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {draft.reuse !== undefined ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: reuse !== null }}
          disabled={disabled}
          onPress={() => onChange({ reuse: { ...draft.reuse!, on: reuse === null } })}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Icon
            icon={CheckmarkCircle02Icon}
            size={22}
            strokeWidth={2}
            themeColor={reuse !== null ? 'primary' : 'border'}
          />
          <View style={styles.cardText}>
            <ThemedText type="smallSemibold">Same card as last time</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {reuse !== null ? draft.reuse.label : 'Off: you’ll pick a card next'}
            </ThemedText>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  config: {
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: BorderRadius,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
