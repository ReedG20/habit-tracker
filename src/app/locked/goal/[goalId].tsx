import { useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';

import { ScreenScrollView } from '@/components/screen-scroll-view';
import { SubmitProofForm } from '@/components/submit-proof-form';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

/** Goal proof from the locked screen: the same form as in the tabs. */
export default function LockedSubmitProofScreen() {
  const { goalId: rawGoalId } = useLocalSearchParams<{ goalId: string }>();
  const goal = useQuery(api.goals.get, { goalId: rawGoalId as Id<'goals'> });

  if (!goal) {
    return <ScreenScrollView />;
  }

  return (
    <SubmitProofForm
      key={goal._id}
      goal={goal}
      onSubmitted={() => router.back()}
      onBack={() => router.back()}
    />
  );
}
