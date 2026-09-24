import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { GoalCard } from '@/components/goal-card';
import { HabitCard } from '@/components/habit-card';
import { HeaderAddButton } from '@/components/header-add-button';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { GoalListIcon } from '@/constants/icons';
import { Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { groupGoals, type GoalWithStatus } from '@/data/goals';
import type { HabitWithProgress } from '@/data/habits';
import { useNow } from '@/hooks/use-now';
import { todayKey } from '@/lib/dates';

type Section =
  | { id: 'goals'; title: string; items: GoalWithStatus[] }
  | { id: 'habits'; title: string; items: HabitWithProgress[] };

export default function CommitmentsScreen() {
  // Refreshed once a minute so "due in 3 hours" and "missed" roll over on their own.
  const now = useNow();
  const goals = useQuery(api.goals.list);
  const habits = useQuery(api.habits.list, { today: todayKey() });

  // Goals first, in their active, missed, done order; then every habit.
  const sections: Section[] | undefined =
    goals && habits
      ? [
          {
            id: 'goals' as const,
            title: 'goals',
            items: groupGoals(goals, now).flatMap((section) => section.items),
          },
          { id: 'habits' as const, title: 'habits', items: habits },
        ].filter((section) => section.items.length > 0)
      : undefined;

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.title} themeColor="text">
          Commitments
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Goals with a deadline and the habits you keep every day.
        </ThemedText>
        <HeaderAddButton label="New" onPress={() => router.push('/new')} />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState
            icon={GoalListIcon}
            message="Nothing yet. Tap New to add a habit or a goal."
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.id === 'goals'
                ? section.items.map((goal) => <GoalCard key={goal._id} goal={goal} now={now} />)
                : section.items.map((habit) => <HabitCard key={habit._id} habit={habit} />)}
            </View>
          </View>
        ))}
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
  title: ScreenHeadingTypography,
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
