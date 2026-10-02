import { router } from 'expo-router';

import { SingleChoiceStep } from '@/components/onboarding/single-choice-step';
import { motivatorOptions } from '@/data/onboarding';
import { track } from '@/lib/analytics';
import { getOnboarding, setAnswers } from '@/lib/onboarding';

export default function MotivatorScreen() {
  return (
    <SingleChoiceStep
      step="motivator"
      title="What keeps you honest?"
      subtitle="Pick the one that actually works on you."
      options={motivatorOptions}
      initial={getOnboarding().answers.motivator}
      onChoose={(motivator) => {
        setAnswers({ motivator });
        track('onboarding step completed', { step: 'motivator', motivator });
        router.push('/onboarding/heard');
      }}
    />
  );
}
