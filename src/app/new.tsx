import { useAction, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cardForStake,
  defaultDueAt,
  endDateInput,
  freshStake,
  friendInput,
  MIN_LEAD_MS,
  plainStake,
  FRESH_PROOF,
  iconInput,
  proofInput,
  reuseForStake,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { draftFromRevisable } from '@/components/commitment/draft-from-commitment';
import { LockedIn } from '@/components/commitment/locked-in';
import { SignStep } from '@/components/commitment/sign-step';
import {
  phaseBeforeSigning,
  StakesStep,
  type StakesPhase,
} from '@/components/commitment/stakes-step';
import { StepProgress } from '@/components/commitment/step-progress';
import { WhatStep, whatTitle, type WhatPhase } from '@/components/commitment/what-step';
import { Icon } from '@/components/icon';
import { DismissKeyboardArea } from '@/components/keyboard/dismiss-keyboard-area';
import { ProPaywallScreen } from '@/components/pro-paywall-screen';
import { openShare, type ShareTarget } from '@/components/share/open-share';
import type { Signed } from '@/components/signed-contract/types';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon, Cancel01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { limitMessage } from '@/convex/lib/commitmentLimits';
import { DAILY } from '@/convex/lib/frequency';
import { draftCallOffUntil } from '@/data/call-off';
import { useSignContract } from '@/hooks/use-sign-contract';
import { captureError, track } from '@/lib/analytics';
import { commitmentCreatedProperties } from '@/lib/analytics-events';
import { cardLabel } from '@/lib/money';
import { describeClock } from '@/lib/dates';
import { userErrorMessage } from '@/lib/user-errors';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';

type Step = 'what' | 'stakes' | 'sign' | 'done';

const STEPS: Step[] = ['what', 'stakes', 'sign'];

function stepTitle(step: Step, whatPhase: WhatPhase, draft: CommitmentDraft): string {
  switch (step) {
    case 'what':
      return whatTitle(whatPhase, draft.kind);
    case 'stakes':
      return 'What’s at stake?';
    case 'sign':
    case 'done':
      return 'Sign it.';
  }
}

/**
 * Making a commitment is three deliberate steps (what and how it's proven,
 * what it costs to miss, and a signed contract) and nothing is created until
 * the last one is held down. It takes Ante Pro: without it, this screen is
 * the paywall, and the steps appear the moment a purchase goes through.
 *
 * `?again=<stakeId>` starts from a goal that was just lost: same words, same
 * stakes, a fresh deadline.
 *
 * `?revise=<goalId|habitId>` (with `kind`) changes the terms of one still in
 * its first moments (`convex/lib/callOff.ts`): everything starts as signed,
 * and locking in swaps the old one out, keeping the time it had left.
 */
export default function NewCommitmentScreen() {
  const params = useLocalSearchParams<{ kind?: string; again?: string; revise?: string }>();
  const createHabit = useMutation(api.habits.create);
  const createHabitStaked = useAction(api.habits.createStaked);
  const createGoal = useMutation(api.goals.create);
  const createStaked = useAction(api.goals.createStaked);
  const signContract = useSignContract();
  const again = useQuery(
    api.stakes.loss,
    params.again === undefined ? 'skip' : { stakeId: params.again as Id<'stakes'> },
  );
  const revising = params.revise !== undefined;
  const revisable = useQuery(
    api.callOff.revisable,
    params.revise === undefined
      ? 'skip'
      : params.kind === 'goal'
        ? { goalId: params.revise as Id<'goals'> }
        : { habitId: params.revise as Id<'habits'> },
  );
  // The swap keeps the old one's window: it never runs longer than this.
  const carried = revisable?.callOffUntil;
  const syncSubscription = useAction(api.subscriptions.sync);
  const subscription = useSubscription();
  const now = useNow();
  const room = useQuery(api.limits.room, { now });

  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [step, setStep] = useState<Step>('what');
  const [whatPhase, setWhatPhase] = useState<WhatPhase>('name');
  const [stakesPhase, setStakesPhase] = useState<StakesPhase>('pick');
  const [busy, setBusy] = useState(false);
  // What lockIn made, so "It’s on." can share it.
  const [created, setCreated] = useState<ShareTarget | null>(null);
  // Until when what lockIn made can be called off, for "It’s on." to say.
  const [lockedCallOffUntil, setLockedCallOffUntil] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState<CommitmentDraft>(() => {
    const kind = params.kind === 'goal' ? 'goal' : 'habit';
    return {
      kind,
      title: '',
      proof: '',
      timesPerWeek: DAILY,
      ...FRESH_PROOF,
      dueAt: defaultDueAt(),
      ...freshStake(true),
    };
  });

  const update = useCallback(
    (patch: Partial<CommitmentDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );

  // Going again after a lost goal: the words and the stakes carry over, once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (again == null || prefilled.current) return;
    prefilled.current = true;
    const { stake } = again;
    update({
      kind: 'goal',
      title: again.title,
      proof: again.goalDescription ?? '',
      stakeKind: stake.kind === 'lockout' ? 'none' : stake.kind,
      ...(stake.kind === 'money'
        ? {
            amountCents: stake.amountCents,
            reuse:
              stake.cardLast4 === undefined
                ? undefined
                : { fromStakeId: stake._id, label: cardLabel(stake), on: true },
          }
        : {}),
    });
  }, [again, update]);

  // Changing the terms: everything starts as it was signed, once, as soon as it loads.
  const [revisePrefilled, setRevisePrefilled] = useState(false);
  if (revising && !revisePrefilled && revisable != null && revisable.callOffUntil > now) {
    setRevisePrefilled(true);
    setDraft((current) => ({ ...current, ...draftFromRevisable(revisable) }));
  }
  // …or, if the window closed before it opened, says so and leaves.
  const warnedTooLate = useRef(false);
  useEffect(() => {
    if (!revising || revisable === undefined || revisePrefilled || warnedTooLate.current) return;
    if (revisable !== null && revisable.callOffUntil > Date.now()) return;
    warnedTooLate.current = true;
    Alert.alert('Too late to change this one', 'It runs as it was signed.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [revisable, revising, revisePrefilled]);

  const goTo = (next: Step) => setStep(next);

  // Already as many of this kind as Ante allows: said up front, before anything is typed.
  const slots = room === undefined ? null : draft.kind === 'habit' ? room.habits : room.goals;
  // A swap gives its slot back first, so it never counts against the limit.
  const full =
    !revising && slots !== null && slots.used >= slots.max ? limitMessage(draft.kind) : null;

  const back = () => {
    // Steps 1 and 2 are two pages each: Back walks through both.
    if (step === 'what' && whatPhase === 'proof') {
      setWhatPhase('name');
      return;
    }
    if (step === 'stakes' && stakesPhase === 'tune') {
      setStakesPhase('pick');
      return;
    }
    if (step === 'sign') {
      setStakesPhase(phaseBeforeSigning(draft));
      goTo('stakes');
      return;
    }
    const index = STEPS.indexOf(step);
    const previous = STEPS[index - 1];
    if (index <= 0 || previous === undefined) {
      router.back();
    } else {
      // Back from the stakes lands on the proof, the page that led there.
      if (previous === 'what') setWhatPhase('proof');
      goTo(previous);
    }
  };

  const lockIn = async (signed: Signed) => {
    if (busy) return;

    const title = draft.title.trim();
    // Empty only for a timer, whose description is optional.
    const description = draft.proof.trim() || undefined;

    if (draft.kind === 'goal' && draft.dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('That deadline has passed', 'Pick a new one and sign again.');
      setWhatPhase('name');
      goTo('what');
      return;
    }

    const createdProperties = commitmentCreatedProperties(draft, {
      source: 'new',
      isRedo: params.again !== undefined,
    });
    const replaces = revising ? params.revise : undefined;
    const goalReplaces = replaces === undefined ? {} : { replaces: replaces as Id<'goals'> };
    const habitReplaces = replaces === undefined ? {} : { replaces: replaces as Id<'habits'> };
    const finish = (reusedCard: boolean) => {
      if (revising) {
        track('commitment terms changed', {
          kind: draft.kind,
          stake_kind: draft.stakeKind,
          from_stake_kind: revisable?.stake?.kind ?? 'none',
          amount_cents: createdProperties.amount_cents,
          days_until_due: createdProperties.days_until_due,
        });
      } else {
        track('commitment created', { ...createdProperties, reused_card: reusedCard });
      }
      setLockedCallOffUntil(draftCallOffUntil(draft, Date.now(), carried));
      goTo('done');
    };

    setBusy(true);
    try {
      // Pro as far as the store knows, but the server has not heard yet.
      if (subscription.source === 'revenuecat') {
        await syncSubscription({}).catch((error: unknown) => {
          console.warn('Subscription sync failed; creating anyway', error);
        });
      }
      if (draft.stakeKind !== 'money') {
        if (draft.kind === 'habit') {
          const habitId = await createHabit({
            title,
            description,
            timesPerWeek: draft.timesPerWeek,
            ...proofInput(draft),
            ...endDateInput(draft),
            ...iconInput(draft),
            stake: plainStake(draft),
            ...habitReplaces,
          });
          signContract({ habitId }, signed);
          setCreated({ habitId });
        } else {
          const goalId = await createGoal({
            title,
            description,
            dueAt: draft.dueAt,
            ...iconInput(draft),
            stake:
              draft.stakeKind === 'friend'
                ? { kind: 'friend', friend: friendInput(draft.friend) }
                : undefined,
            ...goalReplaces,
          });
          signContract({ goalId }, signed);
          setCreated({ goalId });
        }
        finish(createdProperties.reused_card);
        return;
      }

      const reuse = reuseForStake(draft);
      const card = cardForStake(draft);
      if (card === null && reuse === null) {
        // The amount changed after the card was saved; step 2 collects a new one.
        setStakesPhase('tune');
        goTo('stakes');
        return;
      }
      if (draft.kind === 'habit') {
        const habitId = await createHabitStaked({
          title,
          description,
          timesPerWeek: draft.timesPerWeek,
          ...proofInput(draft),
          ...endDateInput(draft),
          ...iconInput(draft),
          amountCents: draft.amountCents,
          ...(card !== null
            ? { setupIntentId: card.setupIntentId }
            : { reuseFromStakeId: reuse?.fromStakeId }),
          ...habitReplaces,
        });
        signContract({ habitId }, signed);
        setCreated({ habitId });
      } else {
        const goalId = await createStaked({
          title,
          description,
          dueAt: draft.dueAt,
          ...iconInput(draft),
          amountCents: draft.amountCents,
          ...(card !== null
            ? { setupIntentId: card.setupIntentId }
            : { reuseFromStakeId: reuse?.fromStakeId }),
          ...goalReplaces,
        });
        signContract({ goalId }, signed);
        setCreated({ goalId });
      }
      finish(card === null);
    } catch (error: unknown) {
      console.error('Failed to lock in the commitment', error);
      captureError(error, 'create commitment');
      if (carried !== undefined && Date.now() >= carried) {
        // The window closed while they were changing it: the old terms stand.
        Alert.alert('Too late to change this one', 'It runs as it was signed.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      Alert.alert(
        "Couldn't lock it in",
        userErrorMessage(error, 'Check your connection and try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!subscription.isPro && !subscription.isLoading && step !== 'done') {
    // A purchase flips `isPro`, and the first step takes this one's place.
    return <ProPaywallScreen source="new" onClose={() => router.back()} onFinished={() => {}} />;
  }

  // Only the very first page closes the screen; every other one steps back.
  const firstPage = step === 'what' && whatPhase === 'name';

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {step === 'done' ? (
        <View style={styles.header} />
      ) : (
        // A tap on the header is a tap outside the fields, so it closes the keyboard.
        <DismissKeyboardArea
          style={[
            styles.header,
            step === 'stakes' && stakesPhase === 'tune' && styles.headerTight,
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={firstPage ? 'Close' : 'Previous step'}
            onPress={back}
            disabled={busy}
            hitSlop={Spacing.three}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon
              icon={firstPage ? Cancel01Icon : ArrowLeft01Icon}
              size={18}
              themeColor="textSecondary"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {firstPage ? 'Close' : 'Back'}
            </ThemedText>
          </Pressable>
          <StepProgress step={STEPS.indexOf(step) + 1} />
          {carried === undefined ? null : (
            <ThemedText type="small" themeColor="textSecondary">
              Changing the terms · until {describeClock(carried, now)}
            </ThemedText>
          )}
          <ThemedText style={styles.title} themeColor="text">
            {stepTitle(step, whatPhase, draft)}
          </ThemedText>
        </DismissKeyboardArea>
      )}

      <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
        {step === 'what' ? (
          <WhatStep
            draft={draft}
            onChange={update}
            onNext={() => goTo('stakes')}
            phase={whatPhase}
            onPhaseChange={setWhatPhase}
            full={full}
          />
        ) : null}
        {step === 'stakes' ? (
          <StakesStep
            draft={draft}
            onChange={update}
            onNext={() => goTo('sign')}
            phase={stakesPhase}
            onPhaseChange={setStakesPhase}
            callOffUntil={draftCallOffUntil(draft, now, carried)}
            replacingCents={
              revisable?.stake?.kind === 'money' ? revisable.stake.amountCents : undefined
            }
          />
        ) : null}
        {step === 'sign' ? (
          <SignStep draft={draft} busy={busy} onConfirm={(signed) => void lockIn(signed)} />
        ) : null}
        {step === 'done' ? (
          <LockedIn
            draft={draft}
            callOffUntil={lockedCallOffUntil}
            {...(revising ? { title: 'Updated.', note: 'same window, new terms.' } : {})}
            onDone={() => router.back()}
            onShare={created === null ? undefined : () => openShare(created, 'locked_in', 'stake')}
          />
        ) : null}
      </Animated.View>
    </View>
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
