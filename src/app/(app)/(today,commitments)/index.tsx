import { useQuery } from 'convex/react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { GoalCard } from '@/components/goal-card';
import { HabitCard } from '@/components/habit-card';
import { ProPausedBanner } from '@/components/pro-paused-banner';
import { NotificationsOffBanner } from '@/components/reminders/notifications-off-banner';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { TodayHero } from '@/components/today-hero';
import { HabitIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { groupIntoHomeSections, type HomeSection } from '@/data/home-sections';
import { formatHoursMinutes, pickTodayMoment } from '@/data/today-moment';
import { useNow } from '@/hooks/use-now';
import { useSubscription } from '@/hooks/use-subscription';
import { endOfDay, todayKey } from '@/lib/dates';

export default function TodayScreen() {
  // Recomputed every render, so the day rolls over on the next interaction
  // without a timer. The value is compared by content, so this does not refetch.
  const today = todayKey();
  const habits = useQuery(api.habits.list, { today });
  // Refreshed once a minute so a goal's countdown and "missed" roll over on their own.
  const now = useNow();
  const goals = useQuery(api.goals.list);
  const sections = habits && goals ? groupIntoHomeSections(habits, goals, today, now) : undefined;
  // Without Pro nothing is checked, so there are no stakes to warn about.
  const subscription = useSubscription();
  const paused = !subscription.isPro && !subscription.isLoading;
  // The first day is free; the hero must not warn about a skip on it.
  const accountableFrom = useQuery(api.lockouts.accountableFrom);
  const freeze = useQuery(api.freezes.current);
  const moment =
    habits && goals && accountableFrom !== undefined && freeze !== undefined
      ? pickTodayMoment({
          habits,
          goals,
          today,
          now,
          accountableFrom,
          frozenUntil: freeze?.endsAt ?? null,
        })
      : undefined;

  /** "6h 12m left" beside today's title, while habits there still have something riding on them. */
  const owesToday =
    !paused && moment != null && moment.kind !== 'clear' && moment.kind !== 'frozen';
  const sectionMeta = (section: HomeSection) =>
    section.id === 'today' && owesToday && section.items.some((item) => item.kind === 'habit')
      ? `${formatHoursMinutes(endOfDay(today) - now)} left`
      : null;

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        {paused ? (
          <ProPausedBanner summary={subscription.summary} />
        ) : (
          moment !== null && (
            // Holds the hero's height while loading so the list doesn't jump.
            <View style={styles.hero}>{moment && <TodayHero moment={moment} />}</View>
          )
        )}
      </View>

      <View style={styles.sections}>
        {/* Paused habits can't lock anything, so only goals are worth the ask. */}
        <NotificationsOffBanner
          habits={paused && habits !== undefined ? [] : habits}
          goals={goals}
          today={today}
          now={now}
        />

        {sections?.length === 0 ? (
          <EmptyState
            icon={HabitIcon}
            message="Nothing for today. Add a habit or goal from Commitments."
          />
        ) : null}

        {sections?.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle} themeColor="text">
                {section.title}
              </ThemedText>
              {sectionMeta(section) === null ? null : (
                <ThemedText type="smallSemibold" themeColor="accent">
                  {sectionMeta(section)}
                </ThemedText>
              )}
            </View>
            <View style={styles.list}>
              {section.items.map((item) =>
                item.kind === 'goal' ? (
                  <GoalCard key={item.goal._id} goal={item.goal} now={now} />
                ) : (
                  <HabitCard
                    key={item.habit._id}
                    habit={item.habit}
                    deadlineAt={paused || freeze != null ? undefined : item.deadlineAt}
                    paused={paused}
                    frozenUntil={freeze?.endsAt}
                  />
                ),
              )}
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
    gap: Spacing.four,
    alignItems: 'center',
  },
  sections: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  // About the shortest a moment gets (kicker, figure, one line), so the list
  // barely moves when the hero arrives.
  hero: {
    alignSelf: 'stretch',
    minHeight: 150,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  sectionTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  list: {
    gap: Spacing.three,
  },
});
