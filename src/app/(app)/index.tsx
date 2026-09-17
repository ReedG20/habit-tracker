import { useQuery } from 'convex/react';
import { StyleSheet, View } from 'react-native';

import { HabitCard } from '@/components/habit-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';

const WISDOM = 'The life you want to live is behind the work you don’t want to do';

export default function HabitsScreen() {
  const habits = useQuery(api.habits.list);

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.wisdom} themeColor="text">
          {WISDOM}
        </ThemedText>
      </View>

      <View style={styles.habitList}>
        {habits?.map((habit) => (
          <HabitCard key={habit._id} habit={habit} />
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
  },
  wisdom: {
    fontFamily: Fonts.wisdom,
    fontSize: 32,
    lineHeight: 40,
  },
  habitList: {
    gap: Spacing.three,
  },
});
