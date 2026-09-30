import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { friendName, proofAction } from './contract-text';
import {
  cardForStake,
  defaultStakeKind,
  isFriendComplete,
  lockoutLabel,
  reuseForStake,
  type CommitmentDraft,
} from './draft';
import { FriendStakeConfig } from './friend-stake-config';
import { LockoutStakeConfig } from './lockout-stake-config';
import { MoneyStakeConfig } from './money-stake-config';
import { Note } from './note';
import { StepLayout } from './step-layout';
import { WhatHappens } from './what-happens';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ChoiceCard } from '@/components/onboarding/choice-card';
import { ThemedText } from '@/components/themed-text';
import { LockIcon, Mail01Icon, Money03Icon, Tick02Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { DAILY } from '@/convex/lib/frequency';
import { MIN_STAKE_CENTS, type StakeKind } from '@/convex/lib/stakeRules';
import { useStakePayment } from '@/hooks/use-stake-payment';
import { captureError, track } from '@/lib/analytics';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { userErrorMessage } from '@/lib/user-errors';

/**
 * The step has two pages under one title: `pick` the kind of stake, then
 * `tune` it (the amount, the friend, how long). "Just my word" has nothing to
 * tune, so it goes from `pick` straight to signing.
 */
export type StakesPhase = 'pick' | 'tune';

/** Where Back from signing lands: the tuning page, unless there was nothing to tune. */
export function phaseBeforeSigning(draft: Pick<CommitmentDraft, 'stakeKind'>): StakesPhase {
  return draft.stakeKind === 'none' ? 'pick' : 'tune';
}

export type StakesStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
  /** Held by the screen, so its Back button can go from `tune` to `pick`. */
  phase: StakesPhase;
  onPhaseChange: (phase: StakesPhase) => void;
  /**
   * `false` before there is an account to save a card to (onboarding): money
   * comes with the next commitment.
   */
  allowMoney?: boolean;
};

/**
 * Step 2: what's on the line. First the pick, on a page of its own: money
 * first, because it works best; then a friend who hears about a miss; for
 * habits, a lockout; and last, their word. Then the chosen kind is tuned on
 * the next page, above "Exactly what happens", which says what a miss does
 * and, for money, is also the disclosure Stripe requires before a card is
 * saved for later.
 */
export function StakesStep({
  draft,
  onChange,
  onNext,
  phase,
  onPhaseChange,
  allowMoney = true,
}: StakesStepProps) {
  const stakePayment = useStakePayment();
  const signedIn = allowMoney;
  const headroom = useQuery(api.stakes.headroom, signedIn ? {} : 'skip') ?? null;
  const [busy, setBusy] = useState(false);

  const moneyBlocked = moneyBlockedReason({
    supported: stakePayment.supported,
    allowMoney,
    headroom,
  });
  const kinds: StakeKind[] =
    draft.kind === 'habit' ? ['money', 'friend', 'lockout', 'none'] : ['money', 'friend', 'none'];

  // Money picked where it can't be had: fall back to the next best thing.
  useEffect(() => {
    if (draft.stakeKind === 'money' && moneyBlocked !== null) {
      onChange({ stakeKind: defaultStakeKind(false) });
    }
  }, [draft.stakeKind, moneyBlocked, onChange]);

  // Keep the amount under what the cap leaves.
  useEffect(() => {
    if (headroom !== null && draft.amountCents > headroom.remainingCents) {
      const amountCents = Math.max(MIN_STAKE_CENTS, headroom.remainingCents);
      if (amountCents !== draft.amountCents) onChange({ amountCents });
    }
  }, [headroom, draft.amountCents, onChange]);

  const next = async () => {
    if (busy) return;
    if (draft.stakeKind !== 'money' || cardForStake(draft) !== null || reuseForStake(draft)) {
      onNext();
      return;
    }

    setBusy(true);
    try {
      const card = await stakePayment.collectCard(draft.amountCents);
      if (card.kind === 'canceled') return;
      onChange({ card: { setupIntentId: card.setupIntentId, amountCents: draft.amountCents } });
      track('card saved', { amount_cents: draft.amountCents });
      onNext();
    } catch (error: unknown) {
      console.error('Failed to save the card', error);
      captureError(error, 'save card');
      Alert.alert(
        "Couldn't save your card",
        userErrorMessage(error, 'Check your connection and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const needsCard =
    draft.stakeKind === 'money' && cardForStake(draft) === null && reuseForStake(draft) === null;
  const ready = draft.stakeKind !== 'friend' || isFriendComplete(draft.friend);

  if (phase === 'pick') {
    return (
      <StepLayout
        footer={
          <ActionButton
            label={pickLabel(draft.stakeKind)}
            variant="primary"
            fill
            onPress={() => (draft.stakeKind === 'none' ? onNext() : onPhaseChange('tune'))}
          />
        }>
        <Animated.View entering={FadeIn.duration(200)} style={styles.kinds}>
          {kinds.map((kind) => {
            const copy = kindCopy(kind, draft, moneyBlocked);
            return (
              <ChoiceCard
                key={kind}
                title={copy.title}
                detail={copy.detail}
                icon={copy.icon}
                badge={copy.badge}
                badgeTone={kind === 'none' ? 'muted' : 'primary'}
                selected={draft.stakeKind === kind}
                disabled={kind === 'money' && moneyBlocked !== null}
                onPress={() => onChange({ stakeKind: kind })}
              />
            );
          })}
        </Animated.View>

        {draft.stakeKind === 'none' ? <Note>{noteFor(draft)}</Note> : null}
      </StepLayout>
    );
  }

  const chosen = kindCopy(draft.stakeKind, draft, moneyBlocked);
  return (
    <StepLayout
      footer={
        <ActionButton
          label={
            busy
              ? 'Opening…'
              : needsCard
                ? `Put ${formatCents(draft.amountCents)} on it`
                : 'Next: sign it'
          }
          variant="primary"
          fill
          disabled={busy || !ready}
          onPress={() => void next()}
        />
      }>
      <Animated.View entering={FadeIn.duration(200)} style={styles.tune}>
        {/* Which kind this page tunes, with the way back to the others. */}
        <View style={styles.chosen}>
          <Icon icon={chosen.icon} size={20} strokeWidth={2} themeColor="primary" />
          <ThemedText type="smallSemibold" style={styles.chosenTitle}>
            {chosen.title}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick a different kind of stake"
            disabled={busy}
            onPress={() => onPhaseChange('pick')}
            hitSlop={Spacing.two}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="smallSemibold" themeColor="primary">
              Change
            </ThemedText>
          </Pressable>
        </View>

        {draft.stakeKind === 'money' ? (
          <MoneyStakeConfig draft={draft} onChange={onChange} disabled={busy} headroom={headroom} />
        ) : null}
        {draft.stakeKind === 'friend' ? (
          <FriendStakeConfig draft={draft} onChange={onChange} signedIn={signedIn} />
        ) : null}
        {draft.stakeKind === 'lockout' ? (
          <LockoutStakeConfig draft={draft} onChange={onChange} />
        ) : null}

        <WhatHappens steps={whatHappens(draft)} />

        {noteFor(draft) === null ? null : <Note>{noteFor(draft)}</Note>}
      </Animated.View>
    </StepLayout>
  );
}

/** The pick page's button says what the next page is for. */
function pickLabel(kind: StakeKind): string {
  switch (kind) {
    case 'money':
      return 'Next: set the amount';
    case 'friend':
      return 'Next: pick who';
    case 'lockout':
      return 'Next: pick how long';
    case 'none':
      return 'Next: sign it';
  }
}

function moneyBlockedReason({
  supported,
  allowMoney,
  headroom,
}: {
  supported: boolean;
  allowMoney: boolean;
  headroom: { remainingCents: number; capCents: number } | null;
}): string | null {
  if (!supported) return 'Money stakes live in the app. On the web, pick another.';
  if (!allowMoney) return 'Money comes once your account is set up.';
  if (headroom !== null && headroom.remainingCents < MIN_STAKE_CENTS) {
    return `You have ${formatCents(headroom.capCents)} on the line, the most Ante allows at once. Finish one to free some up.`;
  }
  return null;
}

function kindCopy(
  kind: StakeKind,
  draft: CommitmentDraft,
  moneyBlocked: string | null,
): { title: string; detail: string; icon: typeof Money03Icon; badge?: string } {
  switch (kind) {
    case 'money':
      return {
        title: 'Put money on it',
        detail:
          moneyBlocked ??
          (draft.kind === 'habit'
            ? 'Break the streak and your card is charged. Nothing gets you up like money.'
            : 'Miss it and your card is charged. Nothing gets you moving like money.'),
        icon: Money03Icon,
        badge: moneyBlocked === null ? 'Most effective' : undefined,
      };
    case 'friend':
      return {
        title: 'Tell a friend',
        detail: 'Miss it and someone you pick gets an email about it.',
        icon: Mail01Icon,
      };
    case 'lockout':
      return {
        title: 'Lock me out',
        detail: 'Break the streak and all your habits freeze for a while. Goals keep running.',
        icon: LockIcon,
      };
    case 'none':
      return {
        title: 'Just my word',
        detail: 'Nothing happens if you miss. Easiest to walk away from.',
        icon: Tick02Icon,
        badge: 'Not recommended',
      };
  }
}

/** The numbered consequences under the options. */
export function whatHappens(draft: CommitmentDraft): string[] {
  const daily = draft.timesPerWeek >= DAILY;
  const days = draft.timesPerWeek === 1 ? 'one day' : `${draft.timesPerWeek} days`;
  const cadence =
    draft.kind === 'goal'
      ? `Before ${formatDueAt(draft.dueAt)}, submit a photo. AI checks it against what you wrote.`
      : daily
        ? `Every day, ${proofAction(draft)} before midnight. The day you start is free.`
        : `Any ${days} a week, ${proofAction(draft)}. Weeks run Monday to Sunday, from the first full one.`;
  const miss =
    draft.kind === 'goal'
      ? 'Miss it, or the proof doesn’t hold up,'
      : daily
        ? 'Miss a day'
        : 'End a week short';
  const restart = 'Then the habit waits for you to restart it.';
  // Stakes can't be walked away from on a bad night: ending gives a week's notice.
  const exit = daily
    ? 'Want out later? Ending takes a week’s notice, and it keeps counting till then.'
    : 'Want out later? Ending takes about a week’s notice, to the nearest Sunday, and it keeps counting till then.';
  const name = friendName(draft);
  const them = name === 'my friend' ? 'them' : name;
  const they = name === 'my friend' ? 'they' : name;

  switch (draft.stakeKind) {
    case 'money':
      return draft.kind === 'habit'
        ? [
            'Your card is saved now. Nothing is charged today.',
            cadence,
            `${miss} and you’re charged ${formatCents(draft.amountCents)}, once, automatically. ${restart}`,
            exit,
          ]
        : [
            'Your card is saved now. Nothing is charged today, and with money on it the goal can’t be deleted.',
            cadence,
            `${miss} and you’re charged ${formatCents(draft.amountCents)} automatically. Make it and nothing happens.`,
          ];
    case 'friend':
      return draft.kind === 'habit'
        ? [
            `We email ${them} a heads-up now. If they reply, it comes to you.`,
            cadence,
            `${miss} and ${they} ${they === 'they' ? 'get' : 'gets'} one email nudging them to check in. The habit then waits for a restart.`,
            exit,
          ]
        : [
            `We email ${them} a heads-up now. If they reply, it comes to you.`,
            cadence,
            `${miss} and ${they} ${they === 'they' ? 'get' : 'gets'} one email nudging them to check in on you.`,
          ];
    case 'lockout':
      return [
        cadence,
        `${miss} and every habit freezes for ${lockoutLabel(draft.lockoutDays)}: nothing can be logged, and no other streak breaks. Goals keep running.`,
        restart,
        exit,
      ];
    case 'none':
      return draft.kind === 'habit'
        ? [cadence, `${miss} and the streak starts over. That’s all that happens.`]
        : [cadence, 'Miss it and nothing happens, except you’ll know.'];
  }
}

function noteFor(draft: CommitmentDraft): string | null {
  switch (draft.stakeKind) {
    case 'money':
      return null;
    case 'friend':
      return 'pick someone you’d hate to let down.';
    case 'lockout':
      return 'the lock is the point. it’s cheaper to just do it.';
    case 'none':
      return 'easy to walk away from. that’s the problem.';
  }
}

const styles = StyleSheet.create({
  kinds: {
    gap: Spacing.two,
  },
  tune: {
    gap: Spacing.four,
  },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chosenTitle: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
