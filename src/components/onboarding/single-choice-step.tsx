import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard } from './choice-card';
import { OnboardingScreen } from './onboarding-screen';

import { Spacing } from '@/constants/theme';
import type { ProgressStep } from '@/data/onboarding';
import { selectionHaptic } from '@/lib/haptics';

/** Long enough to see the check land before the next screen slides in. */
const ADVANCE_DELAY_MS = 220;

export type SingleChoiceStepProps<T extends string> = {
  step: ProgressStep;
  title: string;
  subtitle: string;
  options: { value: T; label: string; detail: string }[];
  initial: T | undefined;
  /** Saves the answer and moves on; called once the selection has shown. */
  onChoose: (value: T) => void;
};

/** A survey question with one answer: tap a card and the flow moves on by itself. */
export function SingleChoiceStep<T extends string>({
  step,
  title,
  subtitle,
  options,
  initial,
  onChoose,
}: SingleChoiceStepProps<T>) {
  const [selected, setSelected] = useState<T | undefined>(initial);
  // A second tap inside the delay would push the next screen twice.
  const advancing = useRef(false);

  const choose = (value: T) => {
    if (advancing.current) return;
    advancing.current = true;
    selectionHaptic();
    setSelected(value);
    setTimeout(() => {
      onChoose(value);
      advancing.current = false;
    }, ADVANCE_DELAY_MS);
  };

  return (
    <OnboardingScreen step={step} title={title} subtitle={subtitle}>
      <View style={styles.options}>
        {options.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={selected === option.value}
            onPress={() => choose(option.value)}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: Spacing.two,
  },
});
