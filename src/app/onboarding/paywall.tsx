import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { CommitmentSummary } from '@/components/onboarding/commitment-summary';
import { FirstCommitmentLive } from '@/components/onboarding/first-commitment-live';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ProPaywall, type PaywallOutcome } from '@/components/pro-paywall';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { SparklesIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import {
  endDateInput,
  friendInput,
  iconInput,
  plainStake,
  proofInput,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { draftCallOffUntil } from '@/data/call-off';
import { commitmentNoun, freshDueAt } from '@/data/onboarding';
import { useSignOut } from '@/hooks/use-sign-out';
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

type Phase = 'offer' | 'saving' | 'failed' | 'live';

/** The first commitment once it's saved, for its "It's on." */
type Live = { target: ContractTarget; draft: CommitmentDraft; callOffUntil: number };

/**
 * The last step, and a hard one: the drafted commitment only starts once Ante
 * Pro does (a trial counts). The survey is saved on arrival since it is not
 * gated; the commitment after the purchase, then its "It's on." (where it can
 * be shared, and a friend on the hook texted), then onboarding completes, which
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
  const signOut = useSignOut();

  // Read once: the draft doesn't change on this screen.
  const [draft] = useState<CommitmentDraft | null>(() => getOnboarding().draft);
  const [phase, setPhase] = useState<Phase>('offer');
  const [outcome, setOutcome] = useState<PaywallOutcome>('purchased');
  const [live, setLive] = useState<Live | null>(null);
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
      heardFrom: answers.heardFrom,
    }).catch((error: unknown) => {
      // The survey is nice to have; it never blocks the commitment.
      console.error('Failed to save the onboarding answers', error);
      captureError(error, 'onboarding survey');
    });
  }, [userId, saveOnboarding]);

  const noun = draft === null ? null : commitmentNoun(draft.kind);

  /** Flips the root guard: the tabs take over from here. */
  const finish = useCallback(() => {
    completeOnboarding();
    const done = noun === null ? 'You’re all set.' : `Your first ${noun} is live.`;
    showToast(
      outcome === 'restored' ? 'Ante Pro restored' : 'Welcome to Ante Pro',
      done,
      'success',
    );
  }, [noun, outcome]);

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
              ...endDateInput(pending),
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
        successHaptic();
        if (target !== null && pending !== null) {
          // Signed a moment ago, so the window the server set is within seconds of this.
          setLive({ target, draft: pending, callOffUntil: draftCallOffUntil(pending, Date.now()) });
          setPhase('live');
        } else {
          // A relaunch after it was saved: nothing new to celebrate.
          finish();
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to save the first commitment', error);
        captureError(error, 'onboarding first commitment');
        started.current = false;
        setPhase('failed');
      });
  }, [userId, phase, outcome, draft, createHabit, createGoal, signContract, finish]);

  if (!isAuthenticated) {
    return <Redirect href="/onboarding/save" />;
  }

  if (phase === 'live' && live !== null) {
    return (
      <FirstCommitmentLive
        draft={live.draft}
        target={live.target}
        callOffUntil={live.callOffUntil}
        onDone={finish}
      />
    );
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
          header={({ trialEligible }) => (
            <View style={styles.proHeader}>
              <View style={styles.proTitleRow}>
                <Icon icon={SparklesIcon} size={24} themeColor="primary" />
                <ThemedText style={styles.proTitle} themeColor="text">
                  Start Ante Pro
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">
                Your {noun ?? 'plan'} starts the moment you do.
                {trialEligible ? ' Try a week free on the yearly plan.' : ''}
              </ThemedText>
            </View>
          )}
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

      {phase === 'offer' || phase === 'failed' ? (
        // Not subscribing still has to leave a way out of the account (App Review 5.1.1(v)).
        <View style={styles.exits}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void signOut().catch((error: unknown) => captureError(error, 'sign out'));
            }}
            hitSlop={Spacing.two}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="textSecondary">
              Sign out
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/onboarding/delete-account')}
            hitSlop={Spacing.two}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="textSecondary">
              Delete account
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  failed: {
    gap: Spacing.three,
  },
  exits: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
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
