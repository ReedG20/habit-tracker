import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DetailHeader } from '@/components/detail-header';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { describeDueDay, formatCompletedAt, todayKey } from '@/lib/dates';

export default function ProjectDetailScreen() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId: string }>();
  const projectId = rawProjectId as Id<'projects'>;

  const theme = useTheme();
  const today = todayKey();
  const project = useQuery(api.projects.get, { projectId });
  const toggleDone = useMutation(api.projects.toggleDone);
  const remove = useMutation(api.projects.remove);

  if (project === undefined) {
    return <ScreenScrollView />;
  }

  if (project === null) {
    return (
      <ScreenScrollView>
        <View style={styles.missing}>
          <ThemedText style={styles.missingTitle} themeColor="text">
            Project not found
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Go back
            </ThemedText>
          </Pressable>
        </View>
      </ScreenScrollView>
    );
  }

  const done = project.completedAt !== undefined;
  const overdue = !done && project.dueDay !== undefined && project.dueDay < today;

  return (
    <ScreenScrollView>
      <DetailHeader
        title={project.title}
        description={project.description}
        deleteLabel="Delete project"
        onEdit={() => router.push(`/project/${projectId}/edit`)}
        onDelete={() =>
          confirmDestructive({
            title: 'Delete project',
            message: 'This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => {
              router.back();
              void remove({ projectId }).catch((error: unknown) => {
                console.error('Failed to delete the project', error);
              });
            },
          })
        }
      />

      <ThemedView type="backgroundElement" style={styles.meta}>
        <View style={styles.metaRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Status
          </ThemedText>
          <ThemedText type="smallBold">{done ? 'Done' : 'In progress'}</ThemedText>
        </View>
        <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Due
          </ThemedText>
          <ThemedText type="smallBold" themeColor={overdue ? 'accent' : 'text'}>
            {project.dueDay ? describeDueDay(project.dueDay, today) : 'No due date'}
          </ThemedText>
        </View>
        {project.completedAt !== undefined ? (
          <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              Completed
            </ThemedText>
            <ThemedText type="smallBold">{formatCompletedAt(project.completedAt).date}</ThemedText>
          </View>
        ) : null}
      </ThemedView>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void toggleDone({ projectId }).catch((error: unknown) => {
            console.error('Failed to toggle the project', error);
          });
        }}
        style={({ pressed }) => [
          styles.toggle,
          done ? { borderColor: theme.border, borderWidth: 1 } : { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}>
        <ThemedText
          type="smallBold"
          style={done ? { color: theme.textSecondary } : { color: theme.onPrimary }}>
          {done ? 'Reopen project' : 'Mark done'}
        </ThemedText>
      </Pressable>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  missing: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  missingTitle: ScreenHeadingTypography,
  meta: {
    borderRadius: BorderRadius,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  toggle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
