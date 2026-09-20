import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { GoalCard } from '@/components/goal-card';
import { HeaderAddButton } from '@/components/header-add-button';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { GoalListIcon } from '@/constants/icons';
import { Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { groupGoals } from '@/data/goals';
import { useGoalSubmissionToasts } from '@/hooks/use-goal-submission-toasts';
import { useNow } from '@/hooks/use-now';

export default function GoalsScreen() {
  // Refreshed once a minute so "due in 3 hours" and "missed" roll over on their own.
  const now = useNow();
  const goals = useQuery(api.goals.list);
  const sections = goals ? groupGoals(goals, now) : undefined;

  useGoalSubmissionToasts(goals);

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.title} themeColor="text">
          Goals
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          One-off commitments with a deadline. Put money on one to make it real.
        </ThemedText>
        <HeaderAddButton label="New" onPress={() => router.push('/goals/new')} />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState
            icon={GoalListIcon}
            message="No goals yet. Tap New to set one — and put money on it."
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.items.map((goal) => (
                <GoalCard key={goal._id} goal={goal} now={now} />
              ))}
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
