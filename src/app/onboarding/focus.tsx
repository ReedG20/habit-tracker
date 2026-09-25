import type { IconSvgElement } from '@hugeicons/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import {
  Book02Icon,
  BrainIcon,
  Dumbbell01Icon,
  FavouriteIcon,
  Home01Icon,
  Money03Icon,
  MoreHorizontalIcon,
  WorkIcon,
} from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { focusAreaOptions, type FocusArea } from '@/data/onboarding';
import { selectionHaptic } from '@/lib/haptics';
import { getOnboarding, setAnswers } from '@/lib/onboarding';

const areaIcons: Record<FocusArea, IconSvgElement> = {
  fitness: Dumbbell01Icon,
  health: FavouriteIcon,
  focus: WorkIcon,
  learning: Book02Icon,
  money: Money03Icon,
  mind: BrainIcon,
  home: Home01Icon,
  other: MoreHorizontalIcon,
};

export default function FocusScreen() {
  const [areas, setAreas] = useState<FocusArea[]>(() => getOnboarding().answers.areas);

  const toggle = (area: FocusArea) => {
    selectionHaptic();
    setAreas((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  };

  return (
    <OnboardingScreen
      step="focus"
      title="What are you working on?"
      subtitle="Pick as many as you like. It shapes what Ante suggests."
      footer={
        <ActionButton
          // Keyed: the SwiftUI host keeps its first measurement across the disabled flip.
          key={areas.length === 0 ? 'empty' : 'ready'}
          label="Continue"
          variant="primary"
          fill
          disabled={areas.length === 0}
          onPress={() => {
            setAnswers({ areas });
            router.push('/onboarding/history');
          }}
        />
      }>
      <View style={styles.chips}>
        {focusAreaOptions.map((option) => (
          <ChoiceChip
            key={option.value}
            label={option.label}
            icon={areaIcons[option.value]}
            selected={areas.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
