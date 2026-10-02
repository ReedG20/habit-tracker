import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { CallOffBanner } from '@/components/call-off-banner';
import { ActivityList, type ActivityItem } from '@/components/commitment-detail/activity-list';
import { ContestChargeLink } from '@/components/commitment-detail/contest-charge-link';
import { DetailSection } from '@/components/commitment-detail/detail-section';
import { DevResetProof } from '@/components/commitment-detail/dev-reset-proof';
import { HabitCalendar } from '@/components/commitment-detail/habit-calendar';
import { HabitNowPanel } from '@/components/commitment-detail/habit-now-panel';
import { StakeStrip } from '@/components/commitment-detail/stake-strip';
import { StatTiles, type Stat } from '@/components/commitment-detail/stat-tiles';
import { TermsCard } from '@/components/commitment-detail/terms-card';
import { RaiseButton } from '@/components/raise/raise-button';
import { openShare } from '@/components/share/open-share';
import { DetailHeader } from '@/components/detail-header';
import { EmptyState } from '@/components/empty-state';
import { EndingBanner } from '@/components/ending-banner';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { CheckmarkCircle02Icon, Flag02Icon, FlameIcon } from '@/constants/icons';
import type { ProofMethod } from '@/constants/proof-methods';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { HabitActivity, HabitDetailHistory } from '@/convex/habitHistory';
import { daysBetween } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import { openCallOff } from '@/data/call-off';
import { formatLastDay } from '@/data/ending';
import { habitTerms } from '@/data/commitment-terms';
import { isDaily, type HabitWithProgress } from '@/data/habits';
import { useCallOff } from '@/hooks/use-call-off';
import { useFriendEmail } from '@/hooks/use-friend-email';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { track } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { todayKey } from '@/lib/dates';
import { useForceDelete } from '@/lib/dev-tools';
import { successHaptic } from '@/lib/haptics';
import { userErrorMessage } from '@/lib/user-errors';

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
  const keepGoing = useMutation(api.habits.keepGoing);
  const resetDay = useMutation(api.devProofs.resetHabitDay);
  const forceDelete = useForceDelete();
  const callOff = useCallOff();
  // What ending it would do today, so the button can say so before it's tapped.
  const terms = useQuery(api.habits.endingTerms, habit === null ? 'skip' : { habitId, today });
  const friendEmail = useFriendEmail(progress?.stakeView);

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
  const stake = progress?.stakeView ?? null;
  // Its first moments, when the deal can still be called off (`convex/lib/callOff.ts`).
  const callOffUntil = openCallOff(habit, stake, now);
  const givesNotice = !forceDelete && callOffUntil === null && terms?.kind === 'notice';

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
    if (callOffUntil !== null) {
      callOff({ target: { habitId }, stake, until: callOffUntil });
    } else if (forceDelete) {
      deleteNow('Force delete is on: it goes right away, with its entire completion history.');
    } else if (terms?.kind === 'notice' && terms.lastDay === habit.endsOn) {
      // Its end date comes before a week's notice would: ending it changes nothing.
      Alert.alert(
        'It’s already finishing',
        `${habit.title} runs through ${formatLastDay(habit.endsOn)}, sooner than a week’s notice would. Keep it up till then.`,
      );
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

  const stats = progress === undefined ? [] : habitStats(progress, history);

  return (
    <ScreenScrollView>
      <DetailHeader
        title={habit.title}
        deleteLabel={givesNotice ? 'End habit' : 'Delete habit'}
        deleteText={givesNotice ? 'End' : 'Delete'}
        deleteIcon={givesNotice ? Flag02Icon : undefined}
        onEdit={() => router.push(`/habit/${habitId}/edit`)}
        onDelete={ending ? undefined : onDelete}
        onShare={habit.brokenAt === undefined ? () => openShare({ habitId }, 'detail') : undefined}>
        {progress === undefined ? null : <StakeStrip stake={stake} paused={paused} />}
      </DetailHeader>

      {/* Shows the notice once ended, or an end date's last week; nothing otherwise. */}
      {progress !== undefined ? (
        <EndingBanner habit={progress} today={today} onKeep={keep} />
      ) : null}

      {callOffUntil === null ? null : (
        <CallOffBanner
          kind="habit"
          title={habit.title}
          until={callOffUntil}
          stake={stake}
          onChangeTerms={() => router.push(`/new?kind=habit&revise=${habitId}`)}
          onCallOff={() => callOff({ target: { habitId }, stake, until: callOffUntil })}
        />
      )}

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

      <DevResetProof
        visible={
          progress !== undefined && (progress.completedToday || progress.verification !== null)
        }
        label="Reset today’s proof"
        message="Deletes today’s log and every check on it, so you can prove it again."
        onReset={() => resetDay({ habitId, day: today })}
      />

      {progress === undefined ? null : (
        <DetailSection title="the deal">
          <TermsCard terms={habitTerms(progress, today, friendEmail)} />
          <RaiseButton
            target={{ habitId }}
            stake={progress.stakeView}
            open={!ending && progress.brokenAt === undefined}
          />
          <ContestChargeLink stake={progress.stakeView} />
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
