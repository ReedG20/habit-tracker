import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HabitCard } from '@/components/habit-card';
import { HeaderAddButton } from '@/components/header-add-button';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { HabitIcon } from '@/constants/icons';
import { Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { groupHabitsIntoSections } from '@/data/habit-sections';
import { todayKey } from '@/lib/dates';

const WISDOM = 'Little by little, a little becomes a lot';

export default function HabitsScreen() {
  // Recomputed every render, so the day rolls over on the next interaction
  // without a timer. The value is compared by content, so this does not refetch.
  const today = todayKey();
  const habits = useQuery(api.habits.list, { today });
  const sections = habits ? groupHabitsIntoSections(habits) : undefined;

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.wisdom} themeColor="text">
          {WISDOM}
        </ThemedText>
        <HeaderAddButton label="New habit" onPress={() => router.push('/habit/new')} />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState icon={HabitIcon} message="No habits yet. Add one to get started." />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.habitList}>
              {section.habits.map((habit) => (
                <HabitCard key={habit._id} habit={habit} today={today} />
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
  wisdom: ScreenHeadingTypography,
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
  habitList: {
    gap: Spacing.three,
  },
});
