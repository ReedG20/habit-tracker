import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActivityList, type ActivityItem } from '@/components/commitment-detail/activity-list';
import { DetailSection } from '@/components/commitment-detail/detail-section';
import { HabitCalendar } from '@/components/commitment-detail/habit-calendar';
import { HabitNowPanel } from '@/components/commitment-detail/habit-now-panel';
import { StatTiles, type Stat } from '@/components/commitment-detail/stat-tiles';
import { TermsCard } from '@/components/commitment-detail/terms-card';
import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { CheckmarkCircle02Icon, FlameIcon } from '@/constants/icons';
import type { ProofMethod } from '@/constants/proof-methods';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { HabitActivity, HabitDetailHistory } from '@/convex/habitHistory';
import { targetPerWeek } from '@/convex/lib/frequency';
import { habitTerms } from '@/data/commitment-terms';
import { describeEnding, isDaily, type HabitWithProgress } from '@/data/habits';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { track } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { todayKey } from '@/lib/dates';
import { useForceDelete } from '@/lib/dev-tools';

export default function HabitDetailScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habitId = rawHabitId as Id<'habits'>;

  const now = useNow();
  const today = todayKey();
  const habit = useQuery(api.habits.get, { habitId });
  // The same list the tabs show, so today's state is already here.
  const habits = useQuery(api.habits.list, { today });
  const progress = habits?.find((entry) => entry._id === habitId);
  const history = useQuery(api.habitHistory.detail, habit === null ? 'skip' : { habitId, today });
  const freeze = useQuery(api.freezes.current);
  const subscription = useSubscription();
  const paused = !subscription.isPro && !subscription.isLoading;
  const remove = useMutation(api.habits.remove);
  const forceDelete = useForceDelete();

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

  const stats = progress === undefined ? [] : habitStats(progress, history);

  return (
    <ScreenScrollView>
      <DetailHeader
        title={habit.title}
        deleteLabel="Delete habit"
        onEdit={() => router.push(`/habit/${habitId}/edit`)}
        onDelete={() =>
          confirmDestructive({
            title: 'Delete habit',
            message: forceDelete
              ? 'Force delete is on: it goes right away, with its entire completion history.'
              : isDaily(habit)
                ? 'If it isn’t logged today, you still owe today: it stays until tonight, then goes with its entire history.'
                : 'If this week’s target isn’t met yet, you still owe this week: it stays until Sunday, then goes with its entire history.',
            confirmLabel: 'Delete',
            onConfirm: () => {
              // Leave first: the screen's queries resolve to null once the row is gone.
              router.back();
              remove({ habitId, force: forceDelete || undefined })
                .then((result) => {
                  track('commitment deleted', { kind: 'habit' });
                  if (result === 'scheduled') {
                    showToast(
                      `${habit.title} is ending`,
                      isDaily(habit)
                        ? 'Log it one last time today.'
                        : 'Finish this week, and it goes after Sunday.',
                    );
                  }
                })
                .catch((error: unknown) => {
                  console.error('Failed to delete the habit', error);
                });
            },
          })
        }
      />

      {habit.endsAfter !== undefined ? (
        <ThemedText type="smallSemibold" themeColor="accent">
          {describeEnding(habit, today)}. It still counts until then.
        </ThemedText>
      ) : null}

      {progress === undefined ? null : (
        <HabitNowPanel
          habit={progress}
          today={today}
          now={now}
          paused={paused}
          frozenUntil={freeze?.endsAt}
          // A habit's first day (or week) never counts against it.
          free={history?.days.at(-1)?.state === 'off' || history?.weeks.at(-1)?.state === 'off'}
        />
      )}

      {progress === undefined ? null : (
        <DetailSection title="the deal">
          <TermsCard terms={habitTerms(progress, today)} />
        </DetailSection>
      )}

      <DetailSection title="progress">
        {stats.length > 0 ? <StatTiles stats={stats} /> : null}
        {history ? (
          <HabitCalendar history={history} today={today} target={targetPerWeek(habit)} />
        ) : null}
      </DetailSection>

      <DetailSection
        title="activity"
        meta={
          history === undefined || history === null || history.total === 0
            ? undefined
            : `${history.total} ${history.total === 1 ? 'log' : 'logs'} all time`
        }>
        {history === undefined || history === null ? null : history.activity.length === 0 ? (
          <EmptyState
            icon={CheckmarkCircle02Icon}
            message="Nothing yet. Every try shows up here, kept or not, with the reason."
          />
        ) : (
          <ActivityList items={history.activity.map(activityItem)} />
        )}
        {history?.moreActivity ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.more}>
            Showing the latest {history.activity.length}.
          </ThemedText>
        ) : null}
      </DetailSection>
    </ScreenScrollView>
  );
}

/** Streak, best streak, and how much of the calendar was kept. */
function habitStats(
  habit: HabitWithProgress,
  history: HabitDetailHistory | null | undefined,
): Stat[] {
  const daily = isDaily(habit);
  const unit = daily ? 'day' : 'week';
  const best = Math.max(history?.best ?? 0, habit.streak);

  let kept = '—';
  if (history) {
    const judged = daily
      ? history.days.filter((day) => day.state === 'done' || day.state === 'missed')
      : history.weeks.filter((week) => week.state === 'met' || week.state === 'short');
    const hits = judged.filter((entry) => entry.state === 'done' || entry.state === 'met').length;
    if (judged.length > 0) kept = `${Math.round((hits / judged.length) * 100)}%`;
  }

  return [
    {
      key: 'streak',
      value: String(habit.streak),
      label: `${unit} streak`,
      icon: habit.streak > 0 ? FlameIcon : undefined,
    },
    { key: 'best', value: history ? String(best) : '—', label: 'best' },
    { key: 'kept', value: kept, label: daily ? 'kept, 5 wks' : 'hit, 12 wks' },
  ];
}

const ATTEMPT_TITLES: Record<HabitActivity['status'], Record<ProofMethod, string>> = {
  approved: { photo: 'Photo accepted', location: 'Checked in', timer: 'Timer finished' },
  rejected: {
    photo: 'Photo didn’t count',
    location: 'Check-in didn’t count',
    timer: 'Timer stopped early',
  },
  failed: {
    photo: 'Couldn’t check it, day excused',
    location: 'Couldn’t check it, day excused',
    timer: 'Couldn’t check it, day excused',
  },
  pending: { photo: 'Checking the photo…', location: 'Checking…', timer: 'Checking…' },
};

function activityItem(attempt: HabitActivity): ActivityItem {
  return {
    id: attempt.id,
    status: attempt.status,
    // A log with no check behind it predates proof methods.
    title:
      attempt.method === undefined && attempt.status === 'approved' && attempt.photoUrl === null
        ? 'Logged'
        : ATTEMPT_TITLES[attempt.status][attempt.method ?? 'photo'],
    at: attempt.at,
    lines: attempt.reason === undefined ? undefined : [attempt.reason],
    photos: attempt.photoUrl === null ? undefined : [{ key: attempt.id, url: attempt.photoUrl }],
  };
}

const styles = StyleSheet.create({
  missing: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  missingTitle: ScreenHeadingTypography,
  more: {
    textAlign: 'center',
  },
});
