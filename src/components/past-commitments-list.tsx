import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Icon } from './icon';
import { INK_DARK } from './today-hero';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { showToast } from './toast';

import { commitmentIcon } from '@/constants/commitment-icons';
import { ArrowRight01Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { StakeView } from '@/convex/lib/stakeRules';
import { pastStakeTag, type PastItem } from '@/data/past-commitments';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { formatShortDate } from '@/lib/dates';
import { openKept } from '@/lib/kept-screen';
import { openLoss } from '@/lib/loss-screen';
import { userErrorMessage } from '@/lib/user-errors';

type Row = {
  key: string;
  title: string;
  icon: ReturnType<typeof commitmentIcon>;
  status: string;
  lost: boolean;
  /** Money, in its own column: the amount and how it ended. */
  money?: { amount: string; label: string; tone: 'lost' | 'kept' | 'quiet'; struck: boolean };
  onPress?: () => void;
  /** Swiping a deleted habit's row offers this; a goal is removed from its own page. */
  onRemove?: () => void;
};

/**
 * Commitments that are over, at the bottom of Commitments: one quiet row each.
 * A goal opens its page; a deleted habit opens its Kept or loss screen, if it
 * had one, and swipes away for good.
 */
export function PastCommitmentsList({ items }: { items: PastItem[] }) {
  // Gone from the list at once; it comes back if the server says no.
  const removeEnded = useMutation(api.endedHabits.remove).withOptimisticUpdate(
    (store, { endedHabitId }) => {
      const list = store.getQuery(api.endedHabits.list, {});
      if (list === undefined) return;
      store.setQuery(
        api.endedHabits.list,
        {},
        list.filter((row) => row._id !== endedHabitId),
      );
    },
  );
  const remove = (endedHabitId: Id<'endedHabits'>) => {
    removeEnded({ endedHabitId }).catch((error: unknown) => {
      showToast('Couldn’t remove it', userErrorMessage(error, 'Try again in a moment.'));
    });
  };

  return (
    // The app has no root for gestures, so the list brings its own (as the toast does).
    <GestureHandlerRootView>
      <ThemedView type="backgroundElement" style={styles.group}>
        {items
          .map((item) => rowOf(item, remove))
          .map((row, index) => (
            <PastRow key={row.key} row={row} divided={index > 0} />
          ))}
      </ThemedView>
    </GestureHandlerRootView>
  );
}

function PastRow({ row, divided }: { row: Row; divided: boolean }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const divider = divided && { borderTopWidth: 1, borderTopColor: theme.border };
  const { money } = row;
  const moneyColor =
    money === undefined
      ? undefined
      : {
          lost: theme.accent,
          // Brand violet lightens on black so it stays readable, as on Today.
          kept: scheme === 'dark' ? INK_DARK : theme.primary,
          quiet: theme.textSecondary,
        }[money.tone];
  const a11y = {
    accessibilityLabel: [
      row.title,
      row.status,
      money === undefined ? undefined : `${money.amount} ${money.label}`,
    ]
      .filter(Boolean)
      .join(', '),
    accessibilityActions: row.onRemove ? [{ name: 'delete', label: 'Remove' }] : undefined,
    onAccessibilityAction: row.onRemove
      ? ({ nativeEvent }: { nativeEvent: { actionName: string } }) => {
          if (nativeEvent.actionName === 'delete') row.onRemove?.();
        }
      : undefined,
  };

  const content = (
    <>
      <View style={[styles.iconTile, { backgroundColor: theme.background }]}>
        <Icon icon={row.icon} size={22} themeColor="textSecondary" />
      </View>
      <View style={styles.body}>
        <ThemedText numberOfLines={1} themeColor="textSecondary">
          {row.title}
        </ThemedText>
        <ThemedText type="small" themeColor={row.lost ? 'accent' : 'textSecondary'}>
          {row.status}
        </ThemedText>
      </View>
      {money === undefined ? null : (
        <View style={styles.money}>
          <Text
            style={[
              styles.amount,
              { color: moneyColor },
              money.struck && styles.struck,
              money.struck && { textDecorationColor: moneyColor },
            ]}>
            {money.amount}
          </Text>
          <ThemedText type="small" style={{ color: moneyColor }}>
            {money.label}
          </ThemedText>
        </View>
      )}
      {row.onPress ? (
        <Icon icon={ArrowRight01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
      ) : null}
    </>
  );

  const body: ReactNode = row.onPress ? (
    <Pressable
      accessibilityRole="button"
      {...a11y}
      onPress={row.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : (
    <View accessible {...a11y} style={styles.row}>
      {content}
    </View>
  );

  if (!row.onRemove) return <View style={divider}>{body}</View>;

  const onRemove = row.onRemove;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={divider}
      // Opaque, so the action behind shows only as the row slides off it.
      childrenContainerStyle={{ backgroundColor: theme.backgroundElement }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${row.title}`}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeAction,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallSemibold" themeColor="onPrimary">
            Remove
          </ThemedText>
        </Pressable>
      )}>
      {body}
    </ReanimatedSwipeable>
  );
}

function rowOf(item: PastItem, remove: (id: Id<'endedHabits'>) => void): Row {
  if (item.kind === 'goal') {
    const { goal } = item;
    const done = goal.completedAt !== undefined;
    return {
      key: goal._id,
      title: goal.title,
      icon: commitmentIcon(goal.icon, 'goal'),
      ...withStake(`${done ? 'Done' : 'Missed'} ${formatShortDate(item.endedAt)}`, goal.stakeView),
      lost: !done,
      onPress: () => router.push(`/goals/${goal._id}`),
    };
  }

  const { habit } = item;
  const logged = `logged ${habit.completions} time${habit.completions === 1 ? '' : 's'}`;
  const { accomplishmentId, stakeId } = habit;
  return {
    key: habit._id,
    title: habit.title,
    icon: commitmentIcon(habit.icon, 'habit'),
    ...withStake(
      `${OUTCOME_LABEL[habit.outcome]} ${formatShortDate(item.endedAt)} · ${logged}`,
      habit.stakeView,
    ),
    lost: habit.outcome === 'lost',
    onPress:
      habit.outcome === 'kept' && accomplishmentId !== undefined
        ? () => openKept(accomplishmentId)
        : habit.outcome === 'lost' && stakeId !== undefined
          ? () => openLoss(stakeId)
          : undefined,
    onRemove: () => remove(habit._id),
  };
}

/** Money takes its own column; a friend or a freeze joins the status line. */
function withStake(status: string, stake: StakeView | null): Pick<Row, 'status' | 'money'> {
  const tag = pastStakeTag(stake);
  if (tag === null) return { status };
  if (tag.kind === 'phrase') return { status: `${status} · ${tag.phrase}` };
  const { amount, label, tone, struck } = tag;
  return { status, money: { amount, label, tone, struck } };
}

const OUTCOME_LABEL = { kept: 'Kept', lost: 'Lost', ended: 'Ended' } as const;

const styles = StyleSheet.create({
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  // Right-aligned, so the amounts line up down the list.
  money: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  amount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  struck: {
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
  },
  removeAction: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
