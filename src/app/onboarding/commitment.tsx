import { useConvexAuth } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_STAKE_CENTS,
  defaultDueAt,
  type CommitmentDraft,
} from '@/components/commitment/draft';
import { SignStep } from '@/components/commitment/sign-step';
import { StakesStep } from '@/components/commitment/stakes-step';
import { WhatStep } from '@/components/commitment/what-step';
import { Icon } from '@/components/icon';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { historyReply, suggestionsFor, suggestKind } from '@/data/onboarding';
import { useTheme } from '@/hooks/use-theme';
import { getOnboarding, setDraft as saveDraft } from '@/lib/onboarding';

type Step = 'what' | 'stakes' | 'sign';

const STEPS: Step[] = ['what', 'stakes', 'sign'];

function stepTitle(step: Step): string {
  switch (step) {
    case 'what':
      return 'What are you committing to?';
    // No price to set: money waits until there is an account to save a card to.
    case 'stakes':
      return 'What’s at stake.';
    case 'sign':
      return 'Sign it.';
  }
}

/**
 * The first commitment, made with the same three-step contract as the `/new`
 * screen, seeded from the survey. Holding to lock it in can't create anything
 * yet (there may be no account), so it writes the signed draft to the device
 * and moves on to sign-in; the paywall step creates it.
 */
export default function OnboardingCommitmentScreen() {
  const { isAuthenticated } = useConvexAuth();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [{ suggestions, reply }] = useState(() => {
    const { answers } = getOnboarding();
    return {
      suggestions: {
        habit: suggestionsFor(answers.areas, 'habit'),
        goal: suggestionsFor(answers.areas, 'goal'),
      },
      reply: historyReply(answers.history),
    };
  });

  const [step, setStep] = useState<Step>('what');
  const [draft, setDraft] = useState<CommitmentDraft>(() => {
    const existing = getOnboarding().draft;
    return (
      existing ?? {
        kind: suggestKind(getOnboarding().answers),
        title: '',
        proof: '',
        dueAt: defaultDueAt(),
        amountCents: DEFAULT_STAKE_CENTS,
        card: null,
      }
    );
  });

  const update = (patch: Partial<CommitmentDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const back = () => {
    const previous = STEPS[STEPS.indexOf(step) - 1];
    if (previous === undefined) {
      router.back();
    } else {
      setStep(previous);
    }
  };

  const lockIn = () => {
    // No money in onboarding: a goal is on the user's word until they have an account.
    saveDraft({ ...draft, amountCents: null, card: null });
    router.push(isAuthenticated ? '/onboarding/paywall' : '/onboarding/save');
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <OnboardingProgress step={step} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={back}
          hitSlop={Spacing.three}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon icon={ArrowLeft01Icon} size={18} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            Back
          </ThemedText>
        </Pressable>
        <View style={styles.heading}>
          <ThemedText style={styles.title} themeColor="text">
            {stepTitle(step)}
          </ThemedText>
          {step === 'what' ? <ThemedText themeColor="textSecondary">{reply}</ThemedText> : null}
        </View>
      </View>

      <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
        {step === 'what' ? (
          <WhatStep
            draft={draft}
            onChange={update}
            onNext={() => setStep('stakes')}
            suggestions={suggestions}
          />
        ) : null}
        {step === 'stakes' ? (
          <StakesStep
            draft={draft}
            onChange={update}
            onNext={() => setStep('sign')}
            allowMoney={false}
          />
        ) : null}
        {step === 'sign' ? <SignStep draft={draft} busy={false} onConfirm={lockIn} /> : null}
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  heading: {
    gap: Spacing.two,
  },
  title: ScreenHeadingTypography,
  step: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
