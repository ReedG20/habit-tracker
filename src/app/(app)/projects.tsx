import type { IconSvgElement } from '@hugeicons/react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FolderLibraryIcon, Rocket01Icon, Target01Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Project = {
  id: string;
  title: string;
  meta: string;
  icon: IconSvgElement;
};

const projects: Project[] = [
  {
    id: 'ship-app',
    title: 'Ship the habit tracker',
    meta: '3 of 8 milestones · started 2 weeks ago',
    icon: Rocket01Icon,
  },
  {
    id: 'read-more',
    title: 'Read 12 books this year',
    meta: '5 of 12 books · on pace',
    icon: FolderLibraryIcon,
  },
];

export default function ProjectsScreen() {
  const theme = useTheme();

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <ThemedText type="subtitle">Projects</ThemedText>
        <ThemedText themeColor="textSecondary">
          Longer arcs that your habits are feeding into.
        </ThemedText>
      </View>

      <View style={styles.list}>
        {projects.map((project) => (
          <ThemedView key={project.id} type="backgroundElement" style={styles.card}>
            <View style={[styles.projectIcon, { backgroundColor: theme.background }]}>
              <Icon icon={project.icon} size={22} />
            </View>
            <View style={styles.cardText}>
              <ThemedText numberOfLines={1}>{project.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {project.meta}
              </ThemedText>
            </View>
          </ThemedView>
        ))}

        <View style={[styles.card, styles.emptyCard, { borderColor: theme.border }]}>
          <Icon icon={Target01Icon} size={20} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            Add a project to tie your habits to an outcome.
          </ThemedText>
        </View>
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    gap: Spacing.one,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  emptyCard: {
    borderStyle: 'dashed',
    borderWidth: 1,
  },
});
