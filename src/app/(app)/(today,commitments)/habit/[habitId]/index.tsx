import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { EndingBanner } from '@/components/ending-banner';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { ThemedView } from '@/components/themed-view';
import { CheckmarkCircle02Icon, Flag02Icon } from '@/constants/icons';
import { CardRadius, Fonts, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { daysBetween } from '@/convex/lib/days';
import { isDaily } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { formatCompletedAt, todayKey } from '@/lib/dates';
import { useForceDelete } from '@/lib/dev-tools';
import { successHaptic } from '@/lib/haptics';
import { userErrorMessage } from '@/lib/user-errors';

const PAGE_SIZE = 30;

export default function HabitDetailScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habitId = rawHabitId as Id<'habits'>;

  const theme = useTheme();
  const today = todayKey();
  const habit = useQuery(api.habits.get, { habitId });
  const stats = useQuery(api.habits.stats, habit === null ? 'skip' : { habitId, today });
  const remove = useMutation(api.habits.remove);
  const keepGoing = useMutation(api.habits.keepGoing);
  const forceDelete = useForceDelete();
  // Usually cached from the list behind this screen; it carries today's progress.
  const progress = useQuery(api.habits.list, { today })?.find((item) => item._id === habitId);
  // What ending it would do today, so the button can say so before it's tapped.
  const terms = useQuery(api.habits.endingTerms, habit === null ? 'skip' : { habitId, today });

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

  const ending = habit.endsAfter !== undefined;
  const givesNotice = !forceDelete && terms?.kind === 'notice';

  const deleteNow = (message: string) =>
    confirmDestructive({
      title: 'Delete habit',
      message,
      confirmLabel: 'Delete',
      onConfirm: () => {
        // Leave first: the screen's queries resolve to null once the row is gone.
        router.back();
        remove({ habitId, force: forceDelete || undefined })
          .then((result) => {
            track('commitment deleted', { kind: 'habit' });
            // The terms changed under the tap (a stake armed since): it gave notice instead.
            if (result === 'scheduled') {
              showToast(
                `${habit.title} is ending`,
                'It keeps counting for a week. Open it to see.',
              );
            }
          })
          .catch((error: unknown) => {
            showToast('Couldn’t delete it', userErrorMessage(error, 'Try again in a moment.'));
          });
      },
    });

  const onDelete = () => {
    if (forceDelete) {
      deleteNow('Force delete is on: it goes right away, with its entire completion history.');
    } else if (terms?.kind === 'notice') {
      router.push(`/habit/${habitId}/end`);
    } else if (terms?.kind === 'now') {
      deleteNow(
        terms.reason === 'not-started'
          ? 'It hasn’t started counting yet, so it goes right away, with its whole history.'
          : 'Nothing’s on the line, so it goes right away, with its whole history.',
      );
    }
  };

  const keep = () => {
    const daysLeft = habit.endsAfter === undefined ? 0 : daysBetween(today, habit.endsAfter).length;
    keepGoing({ habitId })
      .then(() => {
        successHaptic();
        track('habit ending cancelled', { days_left: daysLeft });
        showToast(`${habit.title} is back on`, 'It’s no longer ending.', 'success');
      })
      .catch((error: unknown) => {
        showToast('Couldn’t keep it', userErrorMessage(error, 'Try again in a moment.'));
      });
  };

  return (
    <ScreenScrollView>
      <DetailHeader
        title={habit.title}
        description={habit.description}
        deleteLabel={givesNotice ? 'End habit' : 'Delete habit'}
        deleteText={givesNotice ? 'End' : 'Delete'}
        deleteIcon={givesNotice ? Flag02Icon : undefined}
        onEdit={() => router.push(`/habit/${habitId}/edit`)}
        onDelete={ending ? undefined : onDelete}
      />

      {ending && progress !== undefined ? (
        <EndingBanner habit={progress} today={today} onKeep={keep} />
      ) : null}

      <View style={styles.statRow}>
        <ThemedView type="backgroundElement" style={styles.statTile}>
          <ThemedText style={styles.statValue} themeColor="text">
            {stats?.streak ?? '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isDaily(habit) ? 'Day streak' : 'Week streak'}
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
    borderRadius: CardRadius,
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
    borderRadius: CardRadius,
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
