import { useQuery } from "convex/react";
import { StyleSheet, View } from "react-native";

import { HabitCard } from "@/components/habit-card";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { ThemedText } from "@/components/themed-text";
import { Fonts, ScreenHeadingTypography, Spacing } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { groupHabitsIntoSections } from "@/data/habit-sections";

const WISDOM = "Little by little, a little becomes a lot";

export default function HabitsScreen() {
  const habits = useQuery(api.habits.list);
  const sections = habits ? groupHabitsIntoSections(habits) : undefined;

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.wisdom} themeColor="text">
          {WISDOM}
        </ThemedText>
      </View>

      <View style={styles.sections}>
        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.habitList}>
              {section.habits.map((habit) => (
                <HabitCard key={habit._id} habit={habit} />
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
