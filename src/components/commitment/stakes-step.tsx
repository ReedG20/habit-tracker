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
import { DAILY } from '@/convex/lib/frequency';
import { useStakePayment } from '@/hooks/use-stake-payment';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type StakesStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
  /**
   * `false` before there is an account to save a card to (onboarding): a goal
   * goes ahead on your word, and the step says money comes with the next one.
   */
  allowMoney?: boolean;
};

export function StakesStep(props: StakesStepProps) {
  return props.draft.kind === 'goal' ? (
    <GoalStakes {...props} />
  ) : (
    <HabitStakes timesPerWeek={props.draft.timesPerWeek} onNext={props.onNext} />
  );
}

/** Step 2 for a goal: pick the forfeit, then save a card for it (or explicitly don't). */
function GoalStakes({ draft, onChange, onNext, allowMoney = true }: StakesStepProps) {
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

  if (!stakePayment.supported || !allowMoney) {
    return (
      <StepLayout
        footer={<ActionButton label="Next: sign it" variant="primary" fill onPress={noMoney} />}>
        {allowMoney ? null : (
          <WhatHappens
            steps={[
              `Before ${formatDueAt(draft.dueAt)}, submit a photo. AI checks it against what you wrote.`,
              'Miss it, or the proof doesn’t hold up, and it counts against you.',
              'Once your account is set up, you can put money on the next one.',
            ]}
          />
        )}
        <Note>
          {stakePayment.supported
            ? 'your first one is on your word. make it count.'
            : 'money stakes live in the app. on the web, it’s just your word.'}
        </Note>
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
          'Your card is saved now. Nothing is charged today, and with money on it the goal can’t be deleted.',
          `Before ${formatDueAt(draft.dueAt)}, submit a photo. AI checks it against what you wrote.`,
          `Miss it, or the proof doesn’t hold up, and you’re charged ${formatCents(amountCents)} automatically. Make it and nothing happens.`,
        ]}
      />
    </StepLayout>
  );
}

type DayState = 'done' | 'missed' | 'locked' | 'rest';

/** Daily: three days done, one missed, and every day after it locked. */
const DAILY_STRIP: DayState[] = ['done', 'done', 'done', 'missed', 'locked', 'locked', 'locked'];

/**
 * Weekly: one Monday-to-Sunday week that comes up one short. The logs that did
 * happen are spread across Monday to Saturday, and Sunday is where it locks.
 */
function weeklyStrip(timesPerWeek: number): DayState[] {
  const logged = timesPerWeek - 1;
  const strip: DayState[] = ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'locked'];
  for (let i = 0; i < logged; i += 1) {
    strip[Math.floor((i * 6) / logged)] = 'done';
  }

  return strip;
}

const dayInitial = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/** 1 January 2024 was a Monday; only its weekday names are used. */
const A_MONDAY = new Date(2024, 0, 1);

/** Step 2 for a habit: no money up front, but a miss locks everything. */
function HabitStakes({ timesPerWeek, onNext }: { timesPerWeek: number; onNext: () => void }) {
  const theme = useTheme();
  const daily = timesPerWeek >= DAILY;
  const strip = daily ? DAILY_STRIP : weeklyStrip(timesPerWeek);
  // Daily counts forward from today; weekly shows the week as it is laid out.
  const firstDay = daily ? new Date() : A_MONDAY;
  const days = timesPerWeek === 1 ? 'one day' : `${timesPerWeek} days`;

  return (
    <StepLayout
      footer={<ActionButton label="I understand. Next" variant="primary" fill onPress={onNext} />}>
      <View
        style={styles.week}
        accessible
        accessibilityLabel={
          daily
            ? 'Three days done, one missed, and every day after it locked'
            : `${timesPerWeek - 1} of ${timesPerWeek} done by Sunday, so the week ends short and locks`
        }>
        {strip.map((state, index) => {
          const day = new Date(firstDay);
          day.setDate(firstDay.getDate() + index);
          // The day it all locks on a weekly strip is the Sunday it came up short.
          const lockedShort = !daily && state === 'locked';

          return (
            <View key={index} style={styles.day}>
              <View
                style={[
                  styles.dot,
                  state === 'done' && { backgroundColor: theme.primary },
                  (state === 'missed' || lockedShort) && { backgroundColor: theme.accent },
                  state === 'locked' &&
                    !lockedShort && {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      borderWidth: 1,
                    },
                  state === 'rest' && { backgroundColor: theme.backgroundElement },
                ]}>
                {state === 'rest' ? null : (
                  <Icon
                    icon={
                      state === 'done' ? Tick02Icon : state === 'missed' ? Cancel01Icon : LockIcon
                    }
                    size={state === 'locked' && !lockedShort ? 16 : 18}
                    strokeWidth={state === 'locked' && !lockedShort ? 1.75 : 2.5}
                    color={
                      state === 'locked' && !lockedShort ? theme.textSecondary : theme.onPrimary
                    }
                  />
                )}
              </View>
              <ThemedText
                type="small"
                themeColor={state === 'missed' || lockedShort ? 'accent' : 'textSecondary'}>
                {dayInitial.format(day)}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <WhatHappens
        steps={
          daily
            ? [
                'Every day, prove it with a photo before midnight. The day you start is free.',
                'Miss one day and Ante locks. Your habits freeze with it; goals keep their deadlines.',
                'To get back in, you pay a re-entry fee. The streak doesn’t come back.',
              ]
            : [
                `Any ${days} a week, prove it with a photo. Weeks run Monday to Sunday, from the first full one.`,
                'End a week short and Ante locks. Your habits freeze with it; goals keep their deadlines.',
                'To get back in, you pay a re-entry fee. The streak doesn’t come back.',
              ]
        }
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
