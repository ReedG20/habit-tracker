import { router } from 'expo-router';

import { SingleChoiceStep } from '@/components/onboarding/single-choice-step';
import { historyOptions } from '@/data/onboarding';
import { track } from '@/lib/analytics';
import { getOnboarding, setAnswers } from '@/lib/onboarding';

export default function HistoryScreen() {
  return (
    <SingleChoiceStep
      step="history"
      title="When you’ve tried before, what happened?"
      subtitle="Be honest. Nobody’s keeping score — yet."
      options={historyOptions}
      initial={getOnboarding().answers.history}
      onChoose={(history) => {
        setAnswers({ history });
        track('onboarding step completed', { step: 'history', history });
        router.push('/onboarding/motivator');
      }}
    />
  );
}
