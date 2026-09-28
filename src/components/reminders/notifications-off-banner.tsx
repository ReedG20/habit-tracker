import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Cancel01Icon, NotificationOff01Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import type { GoalWithStatus } from '@/data/goals';
import { isDoneForToday, type HabitWithProgress } from '@/data/habits';
import {
  BANNER_SNOOZE_MS,
  notificationsBannerCopy,
  shouldShowNotificationsBanner,
} from '@/data/notification-banner';
import { useTheme } from '@/hooks/use-theme';
import { endOfDay } from '@/lib/dates';
import { requestPermission, useNotificationPermission } from '@/lib/notifications';

const SNOOZE_KEY = 'notificationsBannerSnoozedUntil';
const DAY_MS = 24 * 60 * 60 * 1000;

let snoozedUntil: number | null = readSnooze();
const listeners = new Set<() => void>();

function readSnooze(): number | null {
  try {
    const stored = Number(SecureStore.getItem(SNOOZE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function snooze(now: number) {
  snoozedUntil = now + BANNER_SNOOZE_MS;
  try {
    SecureStore.setItem(SNOOZE_KEY, String(snoozedUntil));
  } catch {
    // Only lasts this session then; the banner is still dismissed for now.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type NotificationsOffBannerProps = {
  habits: HabitWithProgress[] | undefined;
  goals: GoalWithStatus[] | undefined;
  today: string;
  now: number;
};

/**
 * Asks for notifications back on the Today screen, but only while there is a
 * deadline to be warned about. "×" puts it away for a few days; a deadline
 * under a day away brings it back regardless.
 */
export function NotificationsOffBanner({ habits, goals, today, now }: NotificationsOffBannerProps) {
  const theme = useTheme();
  const permission = useNotificationPermission();
  const snoozed = useSyncExternalStore(subscribe, () => snoozedUntil);

  if (habits === undefined || goals === undefined) return null;
  if (permission !== 'denied' && permission !== 'undetermined') return null;

  const openGoals = goals
    .filter((goal) => goal.completedAt === undefined && goal.dueAt > now)
    .sort((a, b) => a.dueAt - b.dueAt);
  // A habit is always coming due: tonight if today's isn't done, else tomorrow night.
  const habitDeadline =
    habits.length === 0
      ? null
      : habits.some((habit) => !isDoneForToday(habit))
        ? endOfDay(today)
        : endOfDay(today) + DAY_MS;
  const deadlines = [
    ...openGoals.map((goal) => goal.dueAt),
    ...(habitDeadline === null ? [] : [habitDeadline]),
  ];
  const nextDeadline = deadlines.length > 0 ? Math.min(...deadlines) : null;

  if (!shouldShowNotificationsBanner({ permission, nextDeadline, snoozedUntil: snoozed, now })) {
    return null;
  }

  const staked = openGoals.find((goal) => goal.stake?.status === 'armed');
  const copy = notificationsBannerCopy({
    permission,
    stakedGoal:
      staked?.stake === undefined
        ? null
        : { title: staked.title, amountCents: staked.stake.amountCents },
    hasHabits: habits.length > 0,
  });

  return (
    <View style={[styles.card, { backgroundColor: theme.accentElement }]}>
      <View style={styles.heading}>
        <Icon icon={NotificationOff01Icon} size={22} themeColor="accent" />
        <ThemedText type="smallSemibold" themeColor="text" style={styles.headingText}>
          {copy.title}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={Spacing.three}
          onPress={() => snooze(now)}
          style={({ pressed }) => pressed && styles.pressed}>
          <Icon icon={Cancel01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="text">
        {copy.body}
      </ThemedText>
      <ActionButton
        label={copy.action}
        variant="primary"
        size="small"
        onPress={() => {
          void requestPermission().catch((error: unknown) => {
            console.warn('Could not ask for notifications', error);
          });
        }}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headingText: {
    flex: 1,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
