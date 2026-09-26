import { useQuery } from 'convex/react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { GoalCard } from '@/components/goal-card';
import { HabitCard } from '@/components/habit-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { StakesBanner } from '@/components/stakes-banner';
import { ThemedText } from '@/components/themed-text';
import { HabitIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { currentStreak } from '@/data/habits';
import { groupIntoHomeSections } from '@/data/home-sections';
import { useNow } from '@/hooks/use-now';
import { useReentryProduct } from '@/hooks/use-reentry-product';
import { todayKey } from '@/lib/dates';

export default function TodayScreen() {
  // Recomputed every render, so the day rolls over on the next interaction
  // without a timer. The value is compared by content, so this does not refetch.
  const today = todayKey();
  const habits = useQuery(api.habits.list, { today });
  // Refreshed once a minute so a goal's countdown and "missed" roll over on their own.
  const now = useNow();
  const goals = useQuery(api.goals.list);
  const sections = habits && goals ? groupIntoHomeSections(habits, goals, today, now) : undefined;
  const reentry = useReentryProduct();

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <StakesBanner
          fee={
            reentry.status === 'ready'
              ? reentry.product.priceString
              : reentry.status === 'loading'
                ? undefined
                : null
          }
          streak={habits === undefined ? undefined : currentStreak(habits)}
        />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState
            icon={HabitIcon}
            message="Nothing for today. Add a habit or goal from Commitments."
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.items.map((item) =>
                item.kind === 'goal' ? (
                  <GoalCard key={item.goal._id} goal={item.goal} now={now} />
                ) : (
                  <HabitCard key={item.habit._id} habit={item.habit} deadlineAt={item.deadlineAt} />
                ),
              )}
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
    gap: Spacing.four,
    alignItems: 'center',
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
