import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HeaderAddButton } from '@/components/header-add-button';
import { ProjectCard } from '@/components/project-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ProjectIcon } from '@/constants/icons';
import { Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { groupProjectsIntoSections } from '@/data/project-sections';
import { todayKey } from '@/lib/dates';

export default function ProjectsScreen() {
  const today = todayKey();
  const projects = useQuery(api.projects.list);
  const sections = projects ? groupProjectsIntoSections(projects) : undefined;

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText style={styles.title} themeColor="text">
          Projects
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          Longer arcs that your habits are feeding into.
        </ThemedText>
        <HeaderAddButton label="New project" onPress={() => router.push('/project/new')} />
      </View>

      <View style={styles.sections}>
        {sections?.length === 0 ? (
          <EmptyState
            icon={ProjectIcon}
            message="Add a project to tie your habits to an outcome."
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <ThemedText style={styles.sectionTitle} themeColor="text">
              {section.title}
            </ThemedText>
            <View style={styles.list}>
              {section.projects.map((project) => (
                <ProjectCard key={project._id} project={project} today={today} />
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
