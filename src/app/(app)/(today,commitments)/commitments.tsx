import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AnteWordmark } from '@/components/brand/ante-wordmark';
import { EmptyState } from '@/components/empty-state';
import { GoalDetailCard } from '@/components/goal-detail-card';
import { HabitDetailCard } from '@/components/habit-detail-card';
import { HeaderAddButton } from '@/components/header-add-button';
import { PastCommitmentsList } from '@/components/past-commitments-list';
import { ProLockCard } from '@/components/pro-lock-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { GoalListIcon } from '@/constants/icons';
import { Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { isGoalOver, type GoalWithStatus } from '@/data/goals';
import type { HabitWithProgress } from '@/data/habits';
import { pastCommitments } from '@/data/past-commitments';
import { liveGoalCount } from '@/data/pro-lock';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { todayKey } from '@/lib/dates';

type Section =
  | { id: 'goals'; title: string; items: GoalWithStatus[] }
  | { id: 'habits'; title: string; items: HabitWithProgress[] };

export default function CommitmentsScreen() {
  // Refreshed once a minute so "due in 3 hours" and "missed" roll over on their own.
  const now = useNow();
  const goals = useQuery(api.goals.list);
  const today = todayKey();
  const habits = useQuery(api.habits.list, { today });
  // The cards fill in their history once it arrives.
  const history = useQuery(api.habitHistory.recent, { today });
  const historyByHabit = new Map(history?.map((entry) => [entry.habitId, entry]));
  const endedHabits = useQuery(api.endedHabits.list);
  const subscription = useSubscription();
  const paused = !subscription.isPro && !subscription.isLoading;

  // Goals still running first, soonest due on top; then every habit.
  const sections: Section[] | undefined =
    goals && habits
      ? [
          {
            id: 'goals' as const,
            title: 'goals',
            items: goals.filter((goal) => !isGoalOver(goal, now)),
          },
          { id: 'habits' as const, title: paused ? 'habits · paused' : 'habits', items: habits },
        ].filter((section) => section.items.length > 0)
      : undefined;
  // Whatever is over, done or missed or deleted, sinks to Past at the bottom.
  const past = goals && endedHabits ? pastCommitments(goals, endedHabits, now) : [];

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <AnteWordmark accessibilityRole="header" style={styles.masthead} />
        <ThemedText style={styles.title} themeColor="text">
          Commitments
        </ThemedText>
        <ThemedText themeColor="textSecondary">Deadlines to hit and habits to keep.</ThemedText>
        {/* Without Pro, New opens the paywall that leads into the contract. */}
        <HeaderAddButton label="New" locked={paused} onPress={() => router.push('/new')} />
      </View>

      <View style={styles.sections}>
        {paused && goals !== undefined && habits !== undefined ? (
          <ProLockCard
            source="commitments"
            summary={subscription.summary}
            pausedHabits={habits.length}
            liveGoals={liveGoalCount(goals, now)}
          />
        ) : null}

        {/* Without Pro the card above already says how to start. */}
        {sections?.length === 0 && !paused ? (
          <EmptyState
            icon={GoalListIcon}
            message={
              past.length > 0
                ? 'Nothing running. Tap New to add a habit or a goal.'
                : 'Nothing yet. Tap New to add a habit or a goal.'
            }
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.id === 'goals'
                ? section.items.map((goal) => (
                    <GoalDetailCard key={goal._id} goal={goal} now={now} />
                  ))
                : section.items.map((habit) => (
                    <HabitDetailCard
                      key={habit._id}
                      habit={habit}
                      history={historyByHabit.get(habit._id)}
                      paused={paused}
                      now={now}
                    />
                  ))}
            </View>
          </View>
        ))}

        {past.length > 0 ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              past
            </ThemedText>
            <PastCommitmentsList items={past} />
          </View>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.one,
    gap: Spacing.two,
  },
  // At the very top, as on Today, so switching tabs leaves it where it was.
  masthead: {
    marginTop: -Spacing.four,
    marginBottom: Spacing.four,
  },
  // Comico sits high in its line box, so the line's empty bottom already
  // spaces it from the subtitle; this tucks the subtitle up under it.
  title: {
    ...ScreenHeadingTypography,
    marginBottom: -(Spacing.one + Spacing.half),
  },
  sections: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
    paddingHorizontal: Spacing.one,
  },
  list: {
    gap: Spacing.three,
  },
});
