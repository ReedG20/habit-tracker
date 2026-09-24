import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DEFAULT_STAKE_CENTS, type CommitmentDraft } from './draft';
import { Note } from './note';
import { StakeAmountPicker } from './stake-amount-picker';
import { StepLayout } from './step-layout';
import { WhatHappens } from './what-happens';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Cancel01Icon, LockIcon, Tick02Icon } from '@/constants/icons';
import { PillRadius, Spacing } from '@/constants/theme';
import { useStakePayment } from '@/hooks/use-stake-payment';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type StakesStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
};

export function StakesStep(props: StakesStepProps) {
  return props.draft.kind === 'goal' ? (
    <GoalStakes {...props} />
  ) : (
    <HabitStakes onNext={props.onNext} />
  );
}

/** Step 2 for a goal: pick the forfeit, then save a card for it (or explicitly don't). */
function GoalStakes({ draft, onChange, onNext }: StakesStepProps) {
  const theme = useTheme();
  const stakePayment = useStakePayment();
  const [amountCents, setAmountCents] = useState(draft.amountCents ?? DEFAULT_STAKE_CENTS);
  const [busy, setBusy] = useState(false);

  const putMoneyOnIt = async () => {
    if (busy) return;

    // A card saved for this exact amount is still good; any other amount needs a new one.
    if (draft.card?.amountCents === amountCents) {
      onChange({ amountCents });
      onNext();
      return;
    }

    setBusy(true);
    try {
      const card = await stakePayment.collectCard(amountCents);
      if (card.kind === 'canceled') return;

      onChange({ amountCents, card: { setupIntentId: card.setupIntentId, amountCents } });
      onNext();
    } catch (error: unknown) {
      console.error('Failed to save the card', error);
      Alert.alert(
        "Couldn't save your card",
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const noMoney = () => {
    onChange({ amountCents: null });
    onNext();
  };

  if (!stakePayment.supported) {
    return (
      <StepLayout
        footer={<ActionButton label="Next: sign it" variant="primary" fill onPress={noMoney} />}>
        <Note>money stakes live in the app. on the web, it’s just your word.</Note>
      </StepLayout>
    );
  }

  return (
    <StepLayout
      footer={
        <>
          {/* Above the primary action, so that stays in the same spot on every step. */}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={noMoney}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <ThemedText type="smallSemibold" style={{ color: theme.textSecondary }}>
              No money on this one, just my word
            </ThemedText>
          </Pressable>
          <ActionButton
            label={busy ? 'Opening…' : `Put ${formatCents(amountCents)} on it`}
            variant="primary"
            fill
            disabled={busy}
            onPress={() => void putMoneyOnIt()}
          />
        </>
      }>
      <StakeAmountPicker amountCents={amountCents} onChange={setAmountCents} disabled={busy} />

      {/* Also the disclosure Stripe requires before saving a card for off-session use. */}
      <WhatHappens
        steps={[
          'Your card is saved now. Nothing is charged today.',
          `Before ${formatDueAt(draft.dueAt)}, submit a photo. AI checks it against what you wrote.`,
          `Miss it, or the proof doesn’t hold up, and you’re charged ${formatCents(amountCents)} automatically. Make it and nothing happens.`,
        ]}
      />
    </StepLayout>
  );
}

const WEEK: ('done' | 'missed' | 'locked')[] = [
  'done',
  'done',
  'done',
  'missed',
  'locked',
  'locked',
  'locked',
];
const dayInitial = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/** Step 2 for a habit: no money up front, but a miss locks everything. */
function HabitStakes({ onNext }: { onNext: () => void }) {
  const theme = useTheme();
  const today = new Date();

  return (
    <StepLayout
      footer={<ActionButton label="I understand. Next" variant="primary" fill onPress={onNext} />}>
      <View
        style={styles.week}
        accessible
        accessibilityLabel="Three days done, one missed, and every day after it locked">
        {WEEK.map((state, index) => {
          const day = new Date(today);
          day.setDate(today.getDate() + index);

          return (
            <View key={index} style={styles.day}>
              <View
                style={[
                  styles.dot,
                  state === 'done' && { backgroundColor: theme.primary },
                  state === 'missed' && { backgroundColor: theme.accent },
                  state === 'locked' && {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}>
                <Icon
                  icon={
                    state === 'done' ? Tick02Icon : state === 'missed' ? Cancel01Icon : LockIcon
                  }
                  size={state === 'locked' ? 16 : 18}
                  strokeWidth={state === 'locked' ? 1.75 : 2.5}
                  color={state === 'locked' ? theme.textSecondary : theme.onPrimary}
                />
              </View>
              <ThemedText type="small" themeColor={state === 'missed' ? 'accent' : 'textSecondary'}>
                {dayInitial.format(day)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <WhatHappens
        steps={[
          'Every day, prove it with a photo before midnight.',
          'Miss one day and Ante locks. Your other commitments freeze with it.',
          'To get back in, you pay a re-entry fee. The streak doesn’t come back.',
        ]}
      />

      <Note>the lock is the point. it’s cheaper to just do it.</Note>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  secondary: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  day: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 38,
    height: 38,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
