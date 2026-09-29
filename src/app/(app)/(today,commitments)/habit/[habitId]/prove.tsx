import { useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { PROOF_INK } from '@/components/proof/ink';
import { LocationStage } from '@/components/proof/location-stage';
import { PhotoStage } from '@/components/proof/photo-stage';
import { TimerStage } from '@/components/proof/timer-stage';
import { proofMethodOf } from '@/constants/proof-methods';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { watchProof } from '@/lib/proof-watch';

/**
 * Proving a habit, full screen: the camera, a location check-in, or a timer,
 * depending on how the habit is proved. Each is a stage inside the same frame
 * (`ProofShell`) and ends in the same verdict panel (`ProofResult`).
 */
export default function ProveHabitScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const habit = useQuery(api.habits.get, { habitId: habitId as Id<'habits'> });

  // Toasts and a tapped "timer stopped" notification leave this habit to the screen.
  useEffect(() => watchProof(habitId), [habitId]);

  // Once only: "Done" tapped just as the verdict closes itself must not pop the screen below.
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Deleted while open: nothing left to prove.
  const closeGone = useEffectEvent(close);
  useEffect(() => {
    if (habit === null) closeGone();
  }, [habit]);

  if (!habit) {
    return <View style={styles.placeholder} />;
  }

  const method = proofMethodOf(habit);

  return (
    <>
      <StatusBar style="light" />
      {method === 'timer' ? (
        <TimerStage key={habit._id} habit={habit} onClose={close} />
      ) : method === 'location' ? (
        <LocationStage key={habit._id} habit={habit} onClose={close} />
      ) : (
        <PhotoStage key={habit._id} habit={habit} onClose={close} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: PROOF_INK.background,
  },
});
