import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HabitCard } from '@/components/habit-card';
import { HeaderAddButton } from '@/components/header-add-button';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { StakesBanner } from '@/components/stakes-banner';
import { ThemedText } from '@/components/themed-text';
import { HabitIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { currentStreak } from '@/data/habits';
import { groupIntoHomeSections } from '@/data/home-sections';
import { useVerificationToasts } from '@/hooks/use-verification-toasts';
import { todayKey } from '@/lib/dates';

/** Placeholder until stakes live in the backend. */
const PLACEHOLDER_UNFREEZE_FEE = '$24.62';

export default function HabitsScreen() {
  // Recomputed every render, so the day rolls over on the next interaction
  // without a timer. The value is compared by content, so this does not refetch.
  const today = todayKey();
  const habits = useQuery(api.habits.list, { today });
  const sections = habits ? groupIntoHomeSections(habits, today) : undefined;

  useVerificationToasts(habits);

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <StakesBanner
          fee={PLACEHOLDER_UNFREEZE_FEE}
          streak={habits === undefined ? undefined : currentStreak(habits)}
        />
        <HeaderAddButton label="New" onPress={() => router.push('/new')} />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState icon={HabitIcon} message="Nothing yet. Tap New to add a habit." />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.items.map((item) => (
                <HabitCard key={item.habit._id} habit={item.habit} deadlineAt={item.deadlineAt} />
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
