import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { friendName } from './contract-text';
import {
  cardForStake,
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
import { ChoiceCard } from '@/components/onboarding/choice-card';
import { LockIcon, Mail01Icon, Money03Icon, Tick02Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { DAILY } from '@/convex/lib/frequency';
import { MIN_STAKE_CENTS, type StakeKind } from '@/convex/lib/stakeRules';
import { useStakePayment } from '@/hooks/use-stake-payment';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type StakesStepProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
  onNext: () => void;
  /**
   * `false` before there is an account to save a card to (onboarding): money
   * comes with the next commitment.
   */
  allowMoney?: boolean;
};

/**
 * Step 2: what's on the line. Money first, because it works best; then a
 * friend who hears about a miss; for habits, a lockout; and last, their word.
 * Each kind is tuned right under the list, and "Exactly what happens" says
 * what a miss does, which for money is also the disclosure Stripe requires
 * before a card is saved for later.
 */
export function StakesStep({ draft, onChange, onNext, allowMoney = true }: StakesStepProps) {
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
      onChange({ stakeKind: draft.kind === 'habit' ? 'lockout' : 'friend' });
    }
  }, [draft.stakeKind, draft.kind, moneyBlocked, onChange]);

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

  const needsCard =
    draft.stakeKind === 'money' && cardForStake(draft) === null && reuseForStake(draft) === null;
  const ready = draft.stakeKind !== 'friend' || isFriendComplete(draft.friend);

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
      <View style={styles.kinds}>
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
              disabled={busy || (kind === 'money' && moneyBlocked !== null)}
              onPress={() => onChange({ stakeKind: kind })}
            />
          );
        })}
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
    </StepLayout>
  );
}

function moneyBlockedReason({
  supported,
  allowMoney,
  headroom,
}: {
  supported: boolean;
  allowMoney: boolean;
  headroom: { remainingCents: number; capCents: number; blockedByDecline: boolean } | null;
}): string | null {
  if (!supported) return 'Money stakes live in the app. On the web, pick another.';
  if (!allowMoney) return 'Money comes once your account is set up.';
  if (headroom?.blockedByDecline) return 'Settle the stake your card declined first.';
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
        ? 'Every day, prove it with a photo before midnight. The day you start is free.'
        : `Any ${days} a week, prove it with a photo. Weeks run Monday to Sunday, from the first full one.`;
  const miss =
    draft.kind === 'goal'
      ? 'Miss it, or the proof doesn’t hold up,'
      : daily
        ? 'Miss a day'
        : 'End a week short';
  const restart = 'Then the habit waits for you to restart it.';
  const name = friendName(draft);
  const theirName = name === 'my friend' ? 'your friend' : name;

  switch (draft.stakeKind) {
    case 'money':
      return draft.kind === 'habit'
        ? [
            'Your card is saved now. Nothing is charged today.',
            cadence,
            `${miss} and you’re charged ${formatCents(draft.amountCents)}, once, automatically. ${restart}`,
          ]
        : [
            'Your card is saved now. Nothing is charged today, and with money on it the goal can’t be deleted.',
            cadence,
            `${miss} and you’re charged ${formatCents(draft.amountCents)} automatically. Make it and nothing happens.`,
          ];
    case 'friend':
      return [
        `We email ${theirName} now, so they know they’re on the hook. If they reply, it comes to you.`,
        cadence,
        draft.kind === 'habit'
          ? `${miss} and ${theirName} gets one email saying so, with a nudge to check in on you. ${restart}`
          : `${miss} and ${theirName} gets one email saying so, with a nudge to check in on you.`,
      ];
    case 'lockout':
      return [
        cadence,
        `${miss} and every habit freezes for ${lockoutLabel(draft.lockoutDays)}: nothing can be logged, and no other streak breaks. Goals keep running.`,
        restart,
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
      return 'pick someone whose opinion you actually care about.';
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
});
