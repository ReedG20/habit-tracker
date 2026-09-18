import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CheckmarkCircle02Icon } from '@/constants/icons';
import { BorderRadius, Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { formatCompletedAt, todayKey } from '@/lib/dates';

const PAGE_SIZE = 30;

export default function HabitDetailScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habitId = rawHabitId as Id<'habits'>;

  const theme = useTheme();
  const today = todayKey();
  const habit = useQuery(api.habits.get, { habitId });
  const stats = useQuery(api.habits.stats, habit === null ? 'skip' : { habitId, today });
  const remove = useMutation(api.habits.remove);

  const completions = usePaginatedQuery(
    api.habits.listCompletions,
    habit === null ? 'skip' : { habitId },
    { initialNumItems: PAGE_SIZE },
  );

  // `undefined` is still loading; `null` means it was deleted or never existed.
  if (habit === undefined) {
    return <ScreenScrollView />;
  }

  if (habit === null) {
    return (
      <ScreenScrollView>
        <View style={styles.missing}>
          <ThemedText style={styles.missingTitle} themeColor="text">
            Habit not found
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

  return (
    <ScreenScrollView>
      <DetailHeader
        title={habit.title}
        description={habit.description}
        deleteLabel="Delete habit"
        onEdit={() => router.push(`/habit/${habitId}/edit`)}
        onDelete={() =>
          confirmDestructive({
            title: 'Delete habit',
            message: 'This also deletes its entire completion history. This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => {
              // Leave first: the screen's queries resolve to null once the row is gone.
              router.back();
              void remove({ habitId }).catch((error: unknown) => {
                console.error('Failed to delete the habit', error);
              });
            },
          })
        }
      />

      <View style={styles.statRow}>
        <ThemedView type="backgroundElement" style={styles.statTile}>
          <ThemedText style={styles.statValue} themeColor="text">
            {stats?.streak ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Day streak
          </ThemedText>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.statTile}>
          <ThemedText style={styles.statValue} themeColor="text">
            {stats?.total ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Total completions
          </ThemedText>
        </ThemedView>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle} themeColor="text">
          history
        </ThemedText>

        {completions.status !== 'LoadingFirstPage' && completions.results.length === 0 ? (
          <EmptyState
            icon={CheckmarkCircle02Icon}
            message="No completions yet. Log this habit to start its history."
          />
        ) : null}

        <ThemedView type="backgroundElement" style={styles.historyGroup}>
          {completions.results.map((completion, index) => {
            const { date, time } = formatCompletedAt(completion.completedAt);

            return (
              <View
                key={completion._id}
                style={[
                  styles.historyRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                ]}>
                <ThemedText type="small">{date}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {time}
                </ThemedText>
              </View>
            );
          })}
        </ThemedView>

        {completions.status === 'CanLoadMore' || completions.status === 'LoadingMore' ? (
          <Pressable
            accessibilityRole="button"
            disabled={completions.status === 'LoadingMore'}
            onPress={() => completions.loadMore(PAGE_SIZE)}
            style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {completions.status === 'LoadingMore' ? 'Loading…' : 'Load more'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  missing: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  missingTitle: ScreenHeadingTypography,
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statTile: {
    flex: 1,
    borderRadius: BorderRadius,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  statValue: ScreenHeadingTypography,
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
    paddingHorizontal: Spacing.one,
  },
  historyGroup: {
    borderRadius: BorderRadius,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  loadMore: {
    alignSelf: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },
});
