import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Note } from '@/components/commitment/note';
import { ScrollEdgeFooter } from '@/components/scroll-footer/scroll-edge-footer';
import { useScrollEdge } from '@/components/scroll-footer/use-scroll-edge';
import { WhatHappens } from '@/components/commitment/what-happens';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { Fonts, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { daysBetween } from '@/convex/lib/days';
import type { StakeView } from '@/convex/lib/stakeRules';
import { formatLastDay, noticeKeeps, noticeMissCost, noticeRequirement } from '@/data/ending';
import { isDaily, type HabitWithProgress } from '@/data/habits';
import { stakeCost } from '@/data/stakes';
import { track } from '@/lib/analytics';
import { formatShortDate, fromDayKey, todayKey } from '@/lib/dates';
import { warningHaptic } from '@/lib/haptics';
import { formatCents } from '@/lib/money';
import { userErrorMessage } from '@/lib/user-errors';

/**
 * Ending a habit that has something on the line. It doesn't go when tapped:
 * it gives notice and keeps counting (`convex/lib/ending.ts`), so this sheet
 * says exactly how long, and what still rides on it, before the tap.
 */
export default function EndHabitScreen() {
  const { habitId: rawHabitId } = useLocalSearchParams<{ habitId: string }>();
  const habitId = rawHabitId as Id<'habits'>;
  const today = todayKey();
  // Both usually resolve from cache: the detail screen behind this sheet holds them.
  const habits = useQuery(api.habits.list, { today });
  const terms = useQuery(api.habits.endingTerms, { habitId, today });
  const habit = habits?.find((candidate) => candidate._id === habitId);

  if (habit === undefined || terms == null || terms.kind !== 'notice') {
    return <View style={styles.placeholder} />;
  }

  return <EndHabitForm habit={habit} lastDay={terms.lastDay} today={today} />;
}

function EndHabitForm({
  habit,
  lastDay,
  today,
}: {
  habit: HabitWithProgress;
  lastDay: string;
  today: string;
}) {
  const remove = useMutation(api.habits.remove);
  const [ending, setEnding] = useState(false);
  const edge = useScrollEdge();
  const last = formatLastDay(lastDay);
  const miss = noticeMissCost(habit.stakeView);

  const end = () => {
    if (ending) return;
    setEnding(true);
    warningHaptic();
    remove({ habitId: habit._id })
      .then(() => {
        track('habit ending started', {
          notice_days: daysBetween(today, lastDay).length,
          stake_kind: habit.stakeView?.kind ?? 'none',
        });
        router.back();
      })
      .catch((error: unknown) => {
        setEnding(false);
        showToast('Couldn’t end it', userErrorMessage(error, 'Try again in a moment.'));
      });
  };

  const steps = [
    noticeRequirement(habit, lastDay, today),
    ...(miss === null ? [] : [`Miss before then and ${miss}, same as always.`]),
    `Make it to the end and ${noticeKeeps(habit.stakeView)}. It counts as kept, then it’s cleared away with its history.`,
  ];

  return (
    <View style={styles.sheet} collapsable={false}>
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.four + edge.footerHeight },
        ]}
        {...edge.scrollProps}
        alwaysBounceVertical={false}>
        <View style={styles.header}>
          <ThemedText type="smallSemibold" themeColor="textSecondary" numberOfLines={1}>
            Ending “{habit.title}”
          </ThemedText>
          <ThemedText style={styles.title} themeColor="text">
            Ends after {last}.
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {onTheLine(habit.stakeView)}, so ending takes{' '}
            {isDaily(habit) ? 'a week’s notice' : 'about a week’s notice'}. It still counts until
            then.
          </ThemedText>
        </View>

        <WhatHappens steps={steps} />

        <Note style={styles.note}>Change your mind? Keep it any time before then.</Note>
      </ScrollView>

      <ScrollEdgeFooter {...edge.footerProps} style={styles.actions}>
        <ActionButton label="Keep going" onPress={() => router.back()} />
        <ActionButton
          label={ending ? 'Ending…' : `End after ${formatShortDate(fromDayKey(lastDay).getTime())}`}
          accessibilityLabel={`End ${habit.title} after ${last}`}
          variant="destructive"
          fill
          disabled={ending}
          onPress={end}
          style={styles.main}
        />
      </ScrollEdgeFooter>
    </View>
  );
}

/** "You have $20 on this", "Sam is watching this one". */
function onTheLine(stake: StakeView | null): string {
  const cost = stakeCost(stake);
  switch (cost.kind) {
    case 'money':
      return `You have ${formatCents(cost.cents)} on this`;
    case 'friend':
      return `${cost.name} is watching this one`;
    case 'lockout':
      return `A ${cost.days >= 7 ? '1-week' : `${cost.days}-day`} lockout rides on this`;
    case 'none':
      return 'You gave your word on this';
  }
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  placeholder: {
    height: Spacing.six * 4,
  },
  content: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 28,
    lineHeight: 34,
  },
  note: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  main: {
    flex: 1,
  },
});
