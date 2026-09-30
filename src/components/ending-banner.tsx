import { StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { CheckmarkCircle02Icon, HourglassIcon, Tick02Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { daysBetween, weekEnd } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import {
  endingStatus,
  formatLastDay,
  noticeKeeps,
  noticeMissCost,
  noticeRequirement,
} from '@/data/ending';
import { isDaily, type HabitWithProgress } from '@/data/habits';
import { useTheme } from '@/hooks/use-theme';
import { fromDayKey } from '@/lib/dates';

export type EndingBannerProps = {
  habit: HabitWithProgress;
  today: string;
  onKeep: () => void;
};

const initialFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/**
 * The habit detail's notice: how long it still counts, what a miss costs
 * until then, and the way back out. Calm once nothing is left to log.
 */
export function EndingBanner({ habit, today, onKeep }: EndingBannerProps) {
  const theme = useTheme();
  const status = endingStatus(habit, today);
  if (status === null) return null;

  const miss = noticeMissCost(habit.stakeView);
  const keeps = noticeKeeps(habit.stakeView);
  const lastDay = formatLastDay(status.lastDay);

  const heading = status.finished ? 'Last one’s in' : status.label;
  const body = status.finished
    ? `It wraps up ${status.daysLeft <= 1 ? 'tonight' : `after ${lastDay}`}, and ${keeps}.`
    : `${noticeRequirement(habit, status.lastDay)} ${
        miss === null ? '' : `Miss before then and ${miss}.`
      }`.trim();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: status.finished ? theme.backgroundElement : theme.accentElement },
      ]}>
      <View style={styles.heading}>
        <Icon
          icon={status.finished ? CheckmarkCircle02Icon : HourglassIcon}
          size={22}
          strokeWidth={2}
          themeColor={status.finished ? 'textSecondary' : 'accent'}
        />
        <ThemedText type="smallSemibold" themeColor="text" style={styles.headingText}>
          {heading}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="text">
        {body}
      </ThemedText>

      {status.daysLeft > 0 ? (
        <NoticePips habit={habit} today={today} lastDay={status.lastDay} />
      ) : null}

      <ActionButton
        label="Keep it"
        accessibilityLabel={`Keep ${habit.title}, and stop ending it`}
        size="small"
        onPress={onKeep}
        style={styles.button}
      />
    </View>
  );
}

/** One pip per day still counting, or this week's logs toward the target. */
function NoticePips({
  habit,
  today,
  lastDay,
}: {
  habit: HabitWithProgress;
  today: string;
  lastDay: string;
}) {
  if (isDaily(habit)) {
    const days = daysBetween(today, lastDay);
    return (
      <View style={styles.pips} accessibilityLabel={`${days.length} days still count`}>
        {days.map((day) => {
          const done = day === today && habit.completedToday;
          return (
            <View key={day} style={styles.pipColumn}>
              <Pip done={done} current={day === today} />
              <ThemedText
                type="small"
                themeColor={day === today ? 'text' : 'textSecondary'}
                style={styles.pipLabel}>
                {initialFormat.format(fromDayKey(day))}
              </ThemedText>
            </View>
          );
        })}
      </View>
    );
  }

  const target = targetPerWeek(habit);
  const moreWeeks = weekEnd(today) < lastDay;
  return (
    <View style={styles.weekRow}>
      <View style={styles.pips} accessibilityLabel={`${habit.weekCount} of ${target} this week`}>
        {Array.from({ length: target }, (_, index) => (
          <Pip key={index} done={index < habit.weekCount} current={index === habit.weekCount} />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {moreWeeks ? 'this week, then one more' : 'this week'}
      </ThemedText>
    </View>
  );
}

function Pip({ done, current }: { done: boolean; current: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.pip,
        done
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { borderColor: current ? theme.accent : theme.textSecondary },
      ]}>
      {done ? <Icon icon={Tick02Icon} size={12} strokeWidth={3} color={theme.onPrimary} /> : null}
    </View>
  );
}

const PIP = 24;

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
  pips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pipColumn: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  pipLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  pip: {
    width: PIP,
    height: PIP,
    borderRadius: PIP / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
});
