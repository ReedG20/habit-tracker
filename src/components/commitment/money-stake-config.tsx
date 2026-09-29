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
};

/**
 * The amount, held under the cap on money at risk, and, when restarting, the
 * card the last stake was on, so going again doesn't mean typing it again.
 */
export function MoneyStakeConfig({ draft, onChange, disabled, headroom }: MoneyStakeConfigProps) {
  const theme = useTheme();
  const reuse = reuseForStake(draft);
  const maxCents = headroom?.remainingCents;

  return (
    <View style={styles.config}>
      <StakeAmountPicker
        amountCents={draft.amountCents}
        onChange={(amountCents) => onChange({ amountCents })}
        disabled={disabled}
        maxCents={maxCents}
      />

      {headroom !== null && headroom.usedCents > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {formatCents(headroom.usedCents + draft.amountCents)} of {formatCents(headroom.capCents)}{' '}
          on the line with this one.
        </ThemedText>
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
