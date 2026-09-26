import { useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ToastHost } from '@/components/toast';
import { api } from '@/convex/_generated/api';
import { useGoalSubmissionToasts } from '@/hooks/use-goal-submission-toasts';

/**
 * Everything a locked user can reach: the locked screen, and the proof form
 * for a goal that is still due. No tabs. Goal verdicts still toast here, since
 * goals keep running through a lock.
 */
export default function LockedLayout() {
  const goals = useQuery(api.goals.list);
  useGoalSubmissionToasts(goals);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }} />
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
