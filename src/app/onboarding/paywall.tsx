import { useConvexAuth, useMutation } from 'convex/react';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { CommitmentSummary } from '@/components/onboarding/commitment-summary';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ProPaywall } from '@/components/pro-paywall';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { SparklesIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { CommitmentDraft } from '@/components/commitment/draft';
import { commitmentNoun, freshDueAt } from '@/data/onboarding';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { successHaptic } from '@/lib/haptics';
import { completeOnboarding, getOnboarding, markDraftSaved } from '@/lib/onboarding';

type Phase = 'saving' | 'saved' | 'failed';

/**
 * The last step: saves the drafted commitment and the survey to the new
 * account, then offers Pro. "Not now" is always there; nothing in the app is
 * gated yet. Finishing flips the root guard, which swaps this stack for the tabs.
 */
export default function OnboardingPaywallScreen() {
  const { isAuthenticated } = useConvexAuth();
  const userId = useSessionUserId();
  const saveOnboarding = useMutation(api.users.saveOnboarding);
  const createHabit = useMutation(api.habits.create);
  const createGoal = useMutation(api.goals.create);

  // Read once: the draft doesn't change on this screen. A relaunch after it
  // was saved lands here with `draftSaved`, and goes straight to the offer.
  const [draft] = useState<CommitmentDraft | null>(() => getOnboarding().draft);
  const [phase, setPhase] = useState<Phase>(() =>
    draft === null || getOnboarding().draftSaved ? 'saved' : 'saving',
  );
  const started = useRef(false);

  useEffect(() => {
    // Waits for the session so the `users` row exists before anything is written to it.
    if (userId === null || phase !== 'saving' || started.current) return;
    started.current = true;

    const { answers } = getOnboarding();
    void saveOnboarding({
      areas: answers.areas,
      history: answers.history,
      motivator: answers.motivator,
    }).catch((error: unknown) => {
      // The survey is nice to have; it never blocks the commitment.
      console.error('Failed to save the onboarding answers', error);
    });

    const pending = getOnboarding().draftSaved ? null : getOnboarding().draft;
    const save =
      pending === null
        ? Promise.resolve()
        : pending.kind === 'habit'
          ? createHabit({ title: pending.title.trim(), description: pending.proof.trim() })
          : createGoal({
              title: pending.title.trim(),
              description: pending.proof.trim(),
              dueAt: freshDueAt(pending.dueAt),
            });

    save
      .then(() => {
        markDraftSaved();
        successHaptic();
        setPhase('saved');
      })
      .catch((error: unknown) => {
        console.error('Failed to save the first commitment', error);
        started.current = false;
        setPhase('failed');
      });
  }, [userId, phase, saveOnboarding, createHabit, createGoal]);

  if (!isAuthenticated) {
    return <Redirect href="/onboarding/save" />;
  }

  const noun = draft === null ? null : commitmentNoun(draft.kind);

  const finish = (outcome: 'skipped' | 'purchased' | 'restored') => {
    completeOnboarding();
    const live = noun === null ? 'You’re all set.' : `Your first ${noun} is live.`;
    if (outcome === 'skipped') {
      showToast(live, 'Check in with a photo to keep it going.', 'success');
    } else {
      successHaptic();
      showToast('Welcome to Ante Pro', live, 'success');
    }
  };

  const title =
    phase === 'saving'
      ? `Saving your ${noun ?? 'plan'}…`
      : phase === 'failed'
        ? `Couldn’t save your ${noun ?? 'plan'}`
        : 'It’s on.';

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
      ) : phase === 'saved' ? (
        <ProPaywall
          header={
            <View style={styles.proHeader}>
              <View style={styles.proTitleRow}>
                <Icon icon={SparklesIcon} size={24} themeColor="primary" />
                <ThemedText style={styles.proTitle} themeColor="text">
                  Now make it stick
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">
                Ante Pro gives your {noun ?? 'plan'} everything it needs, with nothing held back.
              </ThemedText>
            </View>
          }
          onDismiss={() => finish('skipped')}
          onFinished={finish}
          secondaryAction={{ label: 'Not now', onPress: () => finish('skipped') }}
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
