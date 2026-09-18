import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Countdown } from './countdown';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { ProjectIcon } from '@/constants/icons';
import { BorderRadius, CardRadius, CardShadow, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Project } from '@/data/projects';
import { useTheme } from '@/hooks/use-theme';
import { describeDueDay, isOverdue } from '@/lib/dates';

export type ProjectCardProps = {
  project: Project;
  today: string;
  /** When set, the card counts down to it (urgent items). */
  deadlineAt?: number;
};

export function ProjectCard({ project, today, deadlineAt }: ProjectCardProps) {
  const theme = useTheme();
  const toggleDone = useMutation(api.projects.toggleDone);
  const done = project.completedAt !== undefined;
  const overdue = !done && project.dueDay !== undefined && isOverdue(project.dueDay, today);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${project.title}`}
        onPress={() => router.push(`/project/${project._id}`)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={[styles.projectIcon, { backgroundColor: theme.background }]}>
          <Icon icon={ProjectIcon} size={26} themeColor={done ? 'textSecondary' : 'text'} />
        </View>

        <View style={styles.body}>
          {deadlineAt !== undefined ? <Countdown deadlineAt={deadlineAt} /> : null}
          <ThemedText numberOfLines={1} themeColor={done ? 'textSecondary' : 'text'}>
            {project.title}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor={overdue ? 'accent' : 'textSecondary'}
            numberOfLines={1}>
            {done ? 'Done' : project.dueDay ? describeDueDay(project.dueDay, today) : 'No due date'}
          </ThemedText>
        </View>
      </Pressable>

      <ActionButton
        label={done ? 'Done' : 'Mark done'}
        accessibilityLabel={done ? `Reopen ${project.title}` : `Mark ${project.title} done`}
        variant={done ? 'neutral' : 'primary'}
        size="small"
        onPress={() => {
          void toggleDone({ projectId: project._id }).catch((error: unknown) => {
            console.error('Failed to toggle the project', error);
          });
        }}
        style={styles.doneButton}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.three,
    borderRadius: CardRadius,
    padding: Spacing.three,
    ...CardShadow,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minWidth: 0,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  doneButton: {
    alignSelf: 'flex-start',
    minWidth: 88,
  },
  pressed: {
    opacity: 0.7,
  },
});
