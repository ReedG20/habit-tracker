import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { CommitmentSummary } from '@/components/onboarding/commitment-summary';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ProPaywall, type PaywallOutcome } from '@/components/pro-paywall';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { SparklesIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import {
  friendInput,
  iconInput,
  plainStake,
  proofInput,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { commitmentNoun, freshDueAt } from '@/data/onboarding';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { useSignContract, type ContractTarget } from '@/hooks/use-sign-contract';
import { captureError, track } from '@/lib/analytics';
import { commitmentCreatedProperties } from '@/lib/analytics-events';
import { showDevTools } from '@/lib/dev-tools';
import { successHaptic } from '@/lib/haptics';
import {
  completeOnboarding,
  getFirstSigned,
  getOnboarding,
  markDraftSaved,
  setFirstSigned,
} from '@/lib/onboarding';

type Phase = 'offer' | 'saving' | 'failed';

/**
 * The last step, and a hard one: the drafted commitment only starts once Ante
 * Pro does (a trial counts). The survey is saved on arrival since it is not
 * gated; the commitment after the purchase, then onboarding completes, which
 * flips the root guard and swaps this stack for the tabs. Closing the app here
 * comes back here. Dev and preview builds get a skip that grants Pro.
 */
export default function OnboardingPaywallScreen() {
  const { isAuthenticated } = useConvexAuth();
  const userId = useSessionUserId();
  const saveOnboarding = useMutation(api.users.saveOnboarding);
  const createHabit = useMutation(api.habits.create);
  const createGoal = useMutation(api.goals.create);
  const signContract = useSignContract();
  const devOverrides = useQuery(api.lockouts.devOverrides, showDevTools ? {} : 'skip');
  const devGrantPro = useMutation(api.subscriptions.devGrantPro);

  // Read once: the draft doesn't change on this screen.
  const [draft] = useState<CommitmentDraft | null>(() => getOnboarding().draft);
  const [phase, setPhase] = useState<Phase>('offer');
  const [outcome, setOutcome] = useState<PaywallOutcome>('purchased');
  const surveySaved = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    // Waits for the session so the `users` row exists before anything is written to it.
    if (userId === null || surveySaved.current) return;
    surveySaved.current = true;

    const { answers } = getOnboarding();
    void saveOnboarding({
      areas: answers.areas,
      history: answers.history,
      motivator: answers.motivator,
    }).catch((error: unknown) => {
      // The survey is nice to have; it never blocks the commitment.
      console.error('Failed to save the onboarding answers', error);
      captureError(error, 'onboarding survey');
    });
  }, [userId, saveOnboarding]);

  const noun = draft === null ? null : commitmentNoun(draft.kind);

  useEffect(() => {
    if (userId === null || phase !== 'saving' || started.current) return;
    started.current = true;

    const pending = getOnboarding().draftSaved ? null : getOnboarding().draft;
    const save: Promise<ContractTarget | null> =
      pending === null
        ? Promise.resolve(null)
        : pending.kind === 'habit'
          ? createHabit({
              title: pending.title.trim(),
              description: pending.proof.trim() || undefined,
              timesPerWeek: pending.timesPerWeek,
              ...proofInput(pending),
              ...iconInput(pending),
              stake: plainStake(pending),
            }).then((habitId) => ({ habitId }))
          : createGoal({
              title: pending.title.trim(),
              description: pending.proof.trim(),
              dueAt: freshDueAt(pending.dueAt),
              ...iconInput(pending),
              stake:
                pending.stakeKind === 'friend'
                  ? { kind: 'friend', friend: friendInput(pending.friend) }
                  : undefined,
            }).then((goalId) => ({ goalId }));

    save
      .then((target) => {
        const signed = getFirstSigned();
        if (target !== null && signed !== null) {
          signContract(target, signed);
          setFirstSigned(null);
        }
        if (pending !== null) {
          track(
            'commitment created',
            commitmentCreatedProperties(pending, { source: 'onboarding', isRedo: false }),
          );
        }
        track('onboarding completed', {
          outcome,
          kind: draft?.kind ?? null,
          stake_kind: draft?.stakeKind ?? null,
        });
        markDraftSaved();
        completeOnboarding();
        successHaptic();
        const live = noun === null ? 'You’re all set.' : `Your first ${noun} is live.`;
        showToast(
          outcome === 'restored' ? 'Ante Pro restored' : 'Welcome to Ante Pro',
          live,
          'success',
        );
      })
      .catch((error: unknown) => {
        console.error('Failed to save the first commitment', error);
        captureError(error, 'onboarding first commitment');
        started.current = false;
        setPhase('failed');
      });
  }, [userId, phase, outcome, noun, draft, createHabit, createGoal, signContract]);

  if (!isAuthenticated) {
    return <Redirect href="/onboarding/save" />;
  }

  const start = (result: PaywallOutcome) => {
    setOutcome(result);
    setPhase('saving');
  };

  const skipForDev = () => {
    devGrantPro()
      .then(() => start('purchased'))
      .catch((error: unknown) => console.error('Failed to grant Pro', error));
  };

  const title =
    phase === 'saving'
      ? `Starting your ${noun ?? 'plan'}…`
      : phase === 'failed'
        ? `Couldn’t save your ${noun ?? 'plan'}`
        : 'Last step: start it.';

  return (
    <OnboardingScreen title={title} hideBack>
      {draft !== null ? <CommitmentSummary draft={draft} /> : null}

      {phase === 'failed' ? (
        <View style={styles.failed}>
          <ThemedText themeColor="textSecondary">
            Check your connection and try again. It’s still here.
          </ThemedText>
          <ActionButton
            key="retry"
            label="Try again"
            variant="primary"
            fill
            onPress={() => setPhase('saving')}
          />
        </View>
      ) : phase === 'offer' ? (
        <ProPaywall
          source="onboarding"
          header={
            <View style={styles.proHeader}>
              <View style={styles.proTitleRow}>
                <Icon icon={SparklesIcon} size={24} themeColor="primary" />
                <ThemedText style={styles.proTitle} themeColor="text">
                  Start Ante Pro
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">
                Your {noun ?? 'plan'} starts the moment you do. Try a week free on the yearly plan.
              </ThemedText>
            </View>
          }
          // Only reachable already subscribed (a restore, or a relaunch after buying).
          onDismiss={() => start('restored')}
          doneLabel="Continue"
          onFinished={start}
          secondaryAction={
            devOverrides === true
              ? { label: 'Skip paywall (developer)', onPress: skipForDev }
              : undefined
          }
        />
      ) : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  failed: {
    gap: Spacing.three,
  },
  proHeader: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  proTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  proTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
});
