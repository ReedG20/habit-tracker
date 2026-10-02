import { router } from 'expo-router';

import { SingleChoiceStep } from '@/components/onboarding/single-choice-step';
import { heardFromOptions } from '@/data/onboarding';
import { track } from '@/lib/analytics';
import { getOnboarding, setAnswers } from '@/lib/onboarding';

/**
 * Self-reported attribution: the App Store doesn't say who sent someone, so
 * this is how word of mouth gets counted. Last in the survey and one tap, so
 * it costs the flow almost nothing.
 */
export default function HeardScreen() {
  return (
    <SingleChoiceStep
      step="heard"
      title="How did you find Ante?"
      subtitle="So we know who to thank."
      options={heardFromOptions}
      initial={getOnboarding().answers.heardFrom}
      onChoose={(heardFrom) => {
        setAnswers({ heardFrom });
        track('onboarding step completed', { step: 'heard_from', heard_from: heardFrom });
        router.push('/onboarding/commitment');
      }}
    />
  );
}
