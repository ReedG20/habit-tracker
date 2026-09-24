import { useQuery } from 'convex/react';
import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ToastHost } from '@/components/toast';
import { api } from '@/convex/_generated/api';
import { useGoalSubmissionToasts } from '@/hooks/use-goal-submission-toasts';
import { useVerificationToasts } from '@/hooks/use-verification-toasts';
import { todayKey } from '@/lib/dates';

// Storing the user row and logging RevenueCat in happen in the root navigator
// (`useSignedInSession`), since the onboarding paywall needs them too.
export default function AppLayout() {
  // Watched here rather than on a screen: native tabs keep both lists mounted,
  // so a screen-level hook would raise every verdict twice. Convex shares these
  // subscriptions with the screens, so they cost nothing extra.
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const goals = useQuery(api.goals.list);
  useVerificationToasts(habits);
  useGoalSubmissionToasts(goals);

  return (
    <View style={styles.root}>
      <AppTabs />
      {/* Above every tab and screen, so a verdict shows wherever the user is. */}
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
