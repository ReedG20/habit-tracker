import { useAction, useMutation } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cardForStake,
  DEFAULT_STAKE_CENTS,
  defaultDueAt,
  MIN_LEAD_MS,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { LockedIn } from '@/components/commitment/locked-in';
import { SignStep } from '@/components/commitment/sign-step';
import { StakesStep } from '@/components/commitment/stakes-step';
import { StepProgress } from '@/components/commitment/step-progress';
import { WhatStep } from '@/components/commitment/what-step';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon, Cancel01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useTheme } from '@/hooks/use-theme';

type Step = 'what' | 'stakes' | 'sign' | 'done';

const STEPS: Step[] = ['what', 'stakes', 'sign'];

function stepTitle(step: Step, draft: CommitmentDraft): string {
  switch (step) {
    case 'what':
      return 'What are you committing to?';
    case 'stakes':
      return draft.kind === 'goal' ? 'Set your price.' : 'What’s at stake.';
    case 'sign':
    case 'done':
      return 'Sign it.';
  }
}

/**
 * Making a commitment is three deliberate steps (what and how it's proven,
 * what it costs to miss, and a signed contract) and nothing is created until
 * the last one is held down.
 */
export default function NewCommitmentScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const createHabit = useMutation(api.habits.create);
  const createGoal = useMutation(api.goals.create);
  const createStaked = useAction(api.goals.createStaked);

  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [step, setStep] = useState<Step>('what');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CommitmentDraft>(() => ({
    kind: params.kind === 'goal' ? 'goal' : 'habit',
    title: '',
    proof: '',
    dueAt: defaultDueAt(),
    amountCents: DEFAULT_STAKE_CENTS,
    card: null,
  }));

  const update = (patch: Partial<CommitmentDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const goTo = (next: Step) => setStep(next);

  const back = () => {
    const index = STEPS.indexOf(step);
    const previous = STEPS[index - 1];
    if (index <= 0 || previous === undefined) {
      router.back();
    } else {
      goTo(previous);
    }
  };

  const lockIn = async () => {
    if (busy) return;

    const title = draft.title.trim();
    const description = draft.proof.trim();

    if (draft.kind === 'goal' && draft.dueAt < Date.now() + MIN_LEAD_MS) {
      Alert.alert('That deadline has passed', 'Pick a new one and sign again.');
      goTo('what');
      return;
    }

    setBusy(true);
    try {
      if (draft.kind === 'habit') {
        await createHabit({ title, description });
      } else if (draft.amountCents === null) {
        await createGoal({ title, description, dueAt: draft.dueAt });
      } else {
        const card = cardForStake(draft);
        if (card === null) {
          // The amount changed after the card was saved; step 2 collects a new one.
          goTo('stakes');
          return;
        }
        await createStaked({
          title,
          description,
          dueAt: draft.dueAt,
          amountCents: card.amountCents,
          setupIntentId: card.setupIntentId,
        });
      }
      goTo('done');
    } catch (error: unknown) {
      console.error('Failed to lock in the commitment', error);
      Alert.alert(
        "Couldn't lock it in",
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {step === 'done' ? (
        <View style={styles.header} />
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={step === 'what' ? 'Close' : 'Previous step'}
            onPress={back}
            disabled={busy}
            hitSlop={Spacing.three}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon
              icon={step === 'what' ? Cancel01Icon : ArrowLeft01Icon}
              size={18}
              themeColor="textSecondary"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {step === 'what' ? 'Close' : 'Back'}
            </ThemedText>
          </Pressable>
          <StepProgress step={STEPS.indexOf(step) + 1} />
          <ThemedText style={styles.title} themeColor="text">
            {stepTitle(step, draft)}
          </ThemedText>
        </View>
      )}

      <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
        {step === 'what' ? (
          <WhatStep draft={draft} onChange={update} onNext={() => goTo('stakes')} />
        ) : null}
        {step === 'stakes' ? (
          <StakesStep draft={draft} onChange={update} onNext={() => goTo('sign')} />
        ) : null}
        {step === 'sign' ? (
          <SignStep draft={draft} busy={busy} onConfirm={() => void lockIn()} />
        ) : null}
        {step === 'done' ? <LockedIn draft={draft} onDone={() => router.back()} /> : null}
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
