import { useConvexAuth } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { defaultDueAt, freshStake, type CommitmentDraft } from '@/components/commitment/draft';
import { SignStep } from '@/components/commitment/sign-step';
import {
  phaseBeforeSigning,
  StakesStep,
  type StakesPhase,
} from '@/components/commitment/stakes-step';
import { WhatStep } from '@/components/commitment/what-step';
import { Icon } from '@/components/icon';
import { DismissKeyboardArea } from '@/components/keyboard/dismiss-keyboard-area';
import { OnboardingProgress } from '@/components/onboarding/onboarding-progress';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { DAILY } from '@/convex/lib/frequency';
import { historyReply, suggestionsFor, suggestKind } from '@/data/onboarding';
import { useTheme } from '@/hooks/use-theme';
import { useNotificationPermission } from '@/lib/notifications';
import { getOnboarding, setDraft as saveDraft } from '@/lib/onboarding';

type Step = 'what' | 'stakes' | 'sign';

const STEPS: Step[] = ['what', 'stakes', 'sign'];

function stepTitle(step: Step): string {
  switch (step) {
    case 'what':
      return 'What are you committing to?';
    // No price to set: money waits until there is an account to save a card to.
    case 'stakes':
      return 'What’s at stake?';
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
  const permission = useNotificationPermission();
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
  const [stakesPhase, setStakesPhase] = useState<StakesPhase>('pick');
  const [draft, setDraft] = useState<CommitmentDraft>(() => {
    const existing = getOnboarding().draft;
    return (
      existing ?? {
        kind: suggestKind(getOnboarding().answers),
        title: '',
        proof: '',
        timesPerWeek: DAILY,
        dueAt: defaultDueAt(),
        ...freshStake(suggestKind(getOnboarding().answers), false),
      }
    );
  });

  const update = (patch: Partial<CommitmentDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const back = () => {
    // The stakes step is two pages: Back walks through both.
    if (step === 'stakes' && stakesPhase === 'tune') {
      setStakesPhase('pick');
      return;
    }
    if (step === 'sign') setStakesPhase(phaseBeforeSigning(draft));
    const previous = STEPS[STEPS.indexOf(step) - 1];
    if (previous === undefined) {
      router.back();
    } else {
      setStep(previous);
    }
  };

  const lockIn = () => {
    // No money in onboarding: there's no account to save a card to yet.
    saveDraft({
      ...draft,
      stakeKind: draft.stakeKind === 'money' ? 'none' : draft.stakeKind,
      card: null,
    });
    // Right after signing is when a heads-up makes the most sense; only asked once.
    if (permission === 'undetermined') {
      router.push('/onboarding/reminders');
    } else {
      router.push(isAuthenticated ? '/onboarding/paywall' : '/onboarding/save');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* A tap on the header is a tap outside the fields, so it closes the keyboard. */}
      <DismissKeyboardArea style={styles.header}>
        <OnboardingProgress step={step} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={back}
          hitSlop={Spacing.three}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon icon={ArrowLeft01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
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
      </DismissKeyboardArea>

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
            phase={stakesPhase}
            onPhaseChange={setStakesPhase}
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
