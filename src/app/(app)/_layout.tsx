import { useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { ToastHost } from '@/components/toast';
import { api } from '@/convex/_generated/api';
import { useGoalSubmissionToasts } from '@/hooks/use-goal-submission-toasts';
import { useVerificationToasts } from '@/hooks/use-verification-toasts';
import { todayKey } from '@/lib/dates';
import { logInRevenueCat, logOutRevenueCat } from '@/lib/revenuecat';

export default function AppLayout() {
  const storeUser = useMutation(api.users.storeUser);

  // This layout only mounts behind the authenticated guard, so the identity is
  // always present. Queries tolerate the user row not existing yet and
  // re-resolve on their own once it lands. The user id is also RevenueCat's
  // customer id; unmounting means sign-out, which hands the device back to an
  // anonymous customer.
  useEffect(() => {
    let cancelled = false;
    storeUser()
      .then((userId) => (cancelled ? undefined : logInRevenueCat(userId)))
      .catch((error: unknown) => {
        console.error('Failed to store the signed-in user', error);
      });
    return () => {
      cancelled = true;
      void logOutRevenueCat();
    };
  }, [storeUser]);

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
