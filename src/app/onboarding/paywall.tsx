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
import { friendInput, plainStake, type CommitmentDraft } from '@/components/commitment/draft';
import { commitmentNoun, freshDueAt } from '@/data/onboarding';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { showDevTools } from '@/lib/dev-tools';
import { successHaptic } from '@/lib/haptics';
import { completeOnboarding, getOnboarding, markDraftSaved } from '@/lib/onboarding';

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
    });
  }, [userId, saveOnboarding]);

  const noun = draft === null ? null : commitmentNoun(draft.kind);

  useEffect(() => {
    if (userId === null || phase !== 'saving' || started.current) return;
    started.current = true;

    const pending = getOnboarding().draftSaved ? null : getOnboarding().draft;
    const save =
      pending === null
        ? Promise.resolve()
        : pending.kind === 'habit'
          ? createHabit({
              title: pending.title.trim(),
              description: pending.proof.trim(),
              timesPerWeek: pending.timesPerWeek,
              stake: plainStake(pending),
            })
          : createGoal({
              title: pending.title.trim(),
              description: pending.proof.trim(),
              dueAt: freshDueAt(pending.dueAt),
              stake:
                pending.stakeKind === 'friend'
                  ? { kind: 'friend', friend: friendInput(pending.friend) }
                  : undefined,
            });

    save
      .then(() => {
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
        started.current = false;
        setPhase('failed');
      });
  }, [userId, phase, outcome, noun, createHabit, createGoal]);

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
