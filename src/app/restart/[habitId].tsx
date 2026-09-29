import { useAction, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cardForStake,
  defaultDueAt,
  FRESH_PROOF,
  freshStake,
  plainStake,
  reuseForStake,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { LockedIn } from '@/components/commitment/locked-in';
import { SignStep } from '@/components/commitment/sign-step';
import {
  phaseBeforeSigning,
  StakesStep,
  type StakesPhase,
} from '@/components/commitment/stakes-step';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon, Cancel01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { DAILY } from '@/convex/lib/frequency';
import type { Loss } from '@/convex/stakes';
import { useTheme } from '@/hooks/use-theme';
import { captureError, track } from '@/lib/analytics';
import { cardLabel } from '@/lib/money';

type Step = 'stakes' | 'sign' | 'done';

/** The draft a restart starts from: the habit as it is, with the stakes it lost. */
function draftFor(habit: Doc<'habits'>, lost: Loss | null): CommitmentDraft {
  const draft: CommitmentDraft = {
    kind: 'habit',
    title: habit.title,
    proof: habit.description ?? '',
    timesPerWeek: habit.timesPerWeek ?? DAILY,
    proofMethod: habit.proofMethod ?? FRESH_PROOF.proofMethod,
    timerMinutes: habit.timerMinutes ?? FRESH_PROOF.timerMinutes,
    dueAt: defaultDueAt(),
    ...freshStake('habit', true),
  };
  if (lost === null) return draft;

  const { stake } = lost;
  switch (stake.kind) {
    case 'money':
      return {
        ...draft,
        stakeKind: 'money',
        amountCents: stake.amountCents,
        reuse:
          stake.cardLast4 === undefined
            ? undefined
            : { fromStakeId: stake._id, label: cardLabel(stake), on: true },
      };
    case 'friend':
      return {
        ...draft,
        stakeKind: 'friend',
        friend: { friendId: stake.friendId, name: stake.friendName, email: '' },
      };
    case 'lockout':
      return { ...draft, stakeKind: 'lockout', lockoutDays: stake.days };
  }
}

/**
 * Picking a broken habit back up: new stakes, a fresh signature, and the
 * streak starts over with today free. `?again=<stakeId>` comes from the loss
 * screen and starts at the signature with the same stakes, so going again is
 * one hold away; Back still leads to the stakes to change them.
 */
export default function RestartScreen() {
  const params = useLocalSearchParams<{ habitId: string; again?: string }>();
  const habitId = params.habitId as Id<'habits'>;
  const habit = useQuery(api.habits.get, { habitId });
  const lost = useQuery(
    api.stakes.loss,
    params.again === undefined ? 'skip' : { stakeId: params.again as Id<'stakes'> },
  );
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const loading = habit === undefined || (params.again !== undefined && lost === undefined);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {habit === null ? (
        <View style={styles.header}>
          <ThemedText themeColor="textSecondary">This habit is gone.</ThemedText>
        </View>
      ) : loading ? null : (
        <RestartFlow habit={habit} lost={lost ?? null} again={params.again !== undefined} />
      )}
    </View>
  );
}

function RestartFlow({
  habit,
  lost,
  again,
}: {
  habit: Doc<'habits'>;
  lost: Loss | null;
  again: boolean;
}) {
  const restart = useMutation(api.habits.restart);
  const restartStaked = useAction(api.habits.restartStaked);
  const [draft, setDraft] = useState<CommitmentDraft>(() => draftFor(habit, lost));
  // Straight to the signature only when the same stakes can go on as they are.
  const [step, setStep] = useState<Step>(() => {
    const ready =
      draft.stakeKind !== 'money' || reuseForStake(draft) !== null || cardForStake(draft) !== null;
    return again && ready ? 'sign' : 'stakes';
  });
  // Going again starts at the signature; Back from there lands on the tuning page.
  const [stakesPhase, setStakesPhase] = useState<StakesPhase>(() =>
    again ? phaseBeforeSigning(draft) : 'pick',
  );
  const [busy, setBusy] = useState(false);
  const update = useCallback(
    (patch: Partial<CommitmentDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );

  const lockIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (draft.stakeKind !== 'money') {
        await restart({ habitId: habit._id, stake: plainStake(draft) });
      } else {
        const card = cardForStake(draft);
        const reuse = reuseForStake(draft);
        if (card === null && reuse === null) {
          setStakesPhase('tune');
          setStep('stakes');
          return;
        }
        await restartStaked({
          habitId: habit._id,
          amountCents: draft.amountCents,
          ...(card !== null
            ? { setupIntentId: card.setupIntentId }
            : { reuseFromStakeId: reuse?.fromStakeId }),
        });
      }
      track('commitment restarted', { stake_kind: draft.stakeKind, same_stakes: again });
      setStep('done');
    } catch (error: unknown) {
      console.error('Failed to restart the habit', error);
      captureError(error, 'restart habit');
      Alert.alert(
        "Couldn't restart it",
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'sign') {
      setStakesPhase(phaseBeforeSigning(draft));
      setStep('stakes');
    } else if (stakesPhase === 'tune') {
      setStakesPhase('pick');
    } else {
      router.back();
    }
  };
  const closing = step === 'stakes' && stakesPhase === 'pick';

  return (
    <>
      {step === 'done' ? (
        <View style={styles.header} />
      ) : (
        <View
          style={[
            styles.header,
            step === 'stakes' && stakesPhase === 'tune' && styles.headerTight,
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closing ? 'Close' : 'Back'}
            onPress={back}
            disabled={busy}
            hitSlop={Spacing.three}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon
              icon={closing ? Cancel01Icon : ArrowLeft01Icon}
              size={18}
              themeColor="textSecondary"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {closing ? 'Close' : step === 'sign' ? 'Change the stakes' : 'Back'}
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.title} themeColor="text">
            {step === 'stakes' ? `Back to ${habit.title}.` : 'Sign it again.'}
          </ThemedText>
          {closing ? (
            <ThemedText themeColor="textSecondary">
              Same habit, fresh streak, and today’s free. What’s on the line this time?
            </ThemedText>
          ) : null}
        </View>
      )}

      <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
        {step === 'stakes' ? (
          <StakesStep
            draft={draft}
            onChange={update}
            onNext={() => setStep('sign')}
            phase={stakesPhase}
            onPhaseChange={setStakesPhase}
          />
        ) : null}
        {step === 'sign' ? (
          <SignStep draft={draft} busy={busy} onConfirm={() => void lockIn()} />
        ) : null}
        {step === 'done' ? <LockedIn draft={draft} onDone={() => router.back()} /> : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  // The stakes tuning page's first line labels the page, so it sits closer to the title.
  headerTight: {
    paddingBottom: Spacing.two,
  },
  step: {
    flex: 1,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  pressed: {
    opacity: 0.7,
  },
});
