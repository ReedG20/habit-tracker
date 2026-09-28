import type { Id } from '../_generated/dataModel';
import { countThisWeek, daysLeftInWeek } from './days';
import { DAILY, targetPerWeek } from './frequency';
import { isOwed, type CheckedHabit } from './lockout';
import { LINEUP_TIME, type ReminderSettings } from './reminderPresets';
import { goalSlotTimes, habitSlotTimes, MERGE_MS, type RawSlot } from './reminderTimes';
import { MINUTE_MS, nextLocalMidnight, zonedDay, zonedInstant } from './zonedTime';

export { goalSlotTimes };

/**
 * When deadline reminders go out, kept pure so the rules can be tested without
 * a database. `reminders.runUser` feeds it a snapshot of one user, sends what
 * `selectDue` picks, and sleeps until `nextWake`.
 *
 * Every open commitment has a deadline: a goal's `dueAt`, or tonight's local
 * midnight for a habit still owed today. Deadlines shared by several items
 * become one group, so everything due at midnight is one push, not five.
 * Nothing here decides whether an item is still owed at send time: the plan is
 * rebuilt from fresh data on every run, so a finished item simply drops out.
 */

/** An early nudge this late is dropped: the next one is coming anyway. */
export const STALE_MS = 30 * MINUTE_MS;
/** The least time between two early nudges. Final calls ignore it. */
export const MIN_GAP_MS = 30 * MINUTE_MS;

export type PlanGoal = {
  _id: Id<'goals'>;
  title: string;
  dueAt: number;
  createdAt: number;
  stakeCents: number | null;
  /** Proof is being checked right now; it counts as handled until the verdict. */
  pending: boolean;
};

export type PlanHabit = CheckedHabit & {
  /** Days logged or excused (a check that failed on our side), this week at least. */
  done: Set<string>;
  /** A photo for today is being checked right now. */
  pending: boolean;
};

export type PlanInput = {
  now: number;
  timeZone: string | undefined;
  accountableFrom: string | undefined;
  locked: boolean;
  settings: ReminderSettings;
  /** Open goals only: not completed. */
  goals: PlanGoal[];
  habits: PlanHabit[];
};

export type DueHabit = {
  habitId: Id<'habits'>;
  title: string;
  weeklyNeeded?: number;
  pending: boolean;
};

export type Group =
  | { kind: 'habits'; deadline: number; day: string; habits: DueHabit[] }
  | { kind: 'goals'; deadline: number; goals: PlanGoal[] }
  | { kind: 'lineup'; deadline: number; day: string; habits: DueHabit[]; goals: PlanGoal[] };

export type Slot = {
  at: number;
  group: string;
  deadline: number;
  final: boolean;
};

export type Plan = {
  groups: Map<string, Group>;
  /** Every slot for every open deadline, past and future, earliest first. */
  slots: Slot[];
  /** Whether a new local day could bring new reminders, so it's worth waking at midnight. */
  wakeAtMidnight: boolean;
  /** The next local midnight, when habits are known; else `null`. */
  midnight: number | null;
};

/**
 * Habits still owed tonight. A daily habit not logged today; a weekly one only
 * when it has no slack left, since today is then the only way to make the
 * week. A week that can no longer be made is left alone: nagging can't save it.
 */
export function owedHabits(
  habits: PlanHabit[],
  today: string,
  accountableFrom: string,
): DueHabit[] {
  const due: DueHabit[] = [];
  for (const habit of habits) {
    if (habit.endsAfter !== undefined && today > habit.endsAfter) continue;
    if (habit.done.has(today)) continue;
    if (!isOwed(habit, habit.done, today, accountableFrom)) continue;

    const target = targetPerWeek(habit);
    if (target >= DAILY) {
      due.push({ habitId: habit._id, title: habit.title, pending: habit.pending });
      continue;
    }

    const needed = target - countThisWeek(habit.done, today);
    if (needed === daysLeftInWeek(today)) {
      due.push({
        habitId: habit._id,
        title: habit.title,
        weeklyNeeded: needed,
        pending: habit.pending,
      });
    }
  }
  return due;
}

export function planReminders(input: PlanInput): Plan {
  const { now, timeZone, accountableFrom, settings } = input;
  const groups = new Map<string, Group>();
  const slots: Slot[] = [];

  const add = (group: string, deadline: number, raw: RawSlot[]) => {
    for (const slot of raw) slots.push({ at: slot.at, group, deadline, final: slot.final });
  };

  // Goals sharing a deadline are nudged together.
  const byDeadline = new Map<number, PlanGoal[]>();
  for (const goal of input.goals) {
    if (goal.dueAt <= now) continue;
    byDeadline.set(goal.dueAt, [...(byDeadline.get(goal.dueAt) ?? []), goal]);
  }
  for (const [dueAt, goals] of byDeadline) {
    const key = `goals:${dueAt}`;
    groups.set(key, { kind: 'goals', deadline: dueAt, goals });
    const createdAt = Math.min(...goals.map((goal) => goal.createdAt));
    add(key, dueAt, goalSlotTimes(dueAt, createdAt, settings, timeZone));
  }

  let midnight: number | null = null;
  let wakeAtMidnight = false;
  // Without a zone there is no "tonight", and the lockout never judges them anyway.
  // While locked, habits can't be logged; unlocking makes today free and re-plans.
  if (timeZone !== undefined) {
    midnight = nextLocalMidnight(now, timeZone);
    const today = zonedDay(now, timeZone);
    const habitsCount = accountableFrom !== undefined && !input.locked ? input.habits.length : 0;
    const dueHabits =
      habitsCount > 0 && accountableFrom !== undefined
        ? owedHabits(input.habits, today, accountableFrom)
        : [];

    if (dueHabits.length > 0) {
      const key = `habits:${today}`;
      groups.set(key, { kind: 'habits', deadline: midnight, day: today, habits: dueHabits });
      add(key, midnight, habitSlotTimes(midnight, settings.preset));
    }

    const goalsToday = input.goals.filter((goal) => goal.dueAt > now && goal.dueAt <= midnight!);
    if (settings.morningLineup && (dueHabits.length > 0 || goalsToday.length > 0)) {
      const key = `lineup:${today}`;
      const at = zonedInstant(today, LINEUP_TIME.hour, LINEUP_TIME.minute, timeZone);
      groups.set(key, {
        kind: 'lineup',
        deadline: midnight,
        day: today,
        habits: dueHabits,
        goals: goalsToday,
      });
      add(key, midnight, [{ at, final: false }]);
    }

    wakeAtMidnight = habitsCount > 0 || (settings.morningLineup && input.goals.length > 0);
  }

  slots.sort((a, b) => a.at - b.at);
  return { groups, slots, wakeAtMidnight, midnight };
}

export type SendState = {
  /** Every slot at or before this has been dealt with. */
  sentThrough: number;
  lastPushAt?: number;
  /** The local day `sentToday` counts. */
  day?: string;
  sentToday: number;
};

/**
 * Which slots to act on now: those since `sentThrough`, pulling in any due in
 * the next few minutes so near-simultaneous nudges land together. Only the
 * latest slot per group is kept, so a delayed run never fires a backlog.
 * Final calls always go while their deadline is ahead; early nudges give way
 * when they're stale, too soon after the last push, or over the day's cap.
 */
export function selectDue(
  slots: Slot[],
  state: SendState,
  now: number,
  today: string,
  dailyCap: number,
): { due: Slot[]; sentThrough: number; sentToday: number } {
  const horizon = now + MERGE_MS;
  const latest = new Map<string, Slot>();
  let sentThrough = Math.max(state.sentThrough, now);

  for (const slot of slots) {
    if (slot.at <= state.sentThrough || slot.at > horizon) continue;
    sentThrough = Math.max(sentThrough, slot.at);
    if (now >= slot.deadline) continue;
    const seen = latest.get(slot.group);
    if (seen === undefined || slot.at >= seen.at) latest.set(slot.group, slot);
  }

  let sentToday = state.day === today ? state.sentToday : 0;
  const ordered = [...latest.values()].sort(
    (a, b) => Number(b.final) - Number(a.final) || a.deadline - b.deadline,
  );

  const due: Slot[] = [];
  for (const slot of ordered) {
    if (!slot.final) {
      if (now - slot.at > STALE_MS) continue;
      if (sentToday >= dailyCap) continue;
      if (state.lastPushAt !== undefined && now - state.lastPushAt < MIN_GAP_MS) continue;
    }
    due.push(slot);
    sentToday += 1;
  }

  return { due, sentThrough, sentToday };
}

/**
 * When to run next: the first slot still ahead, or just after midnight when a
 * new day could owe something. Never more than a day out, so a long-range
 * goal is re-planned daily. `null` when there is nothing left to watch.
 */
export function nextWake(plan: Plan, sentThrough: number, now: number): number | null {
  let next: number | null = null;
  for (const slot of plan.slots) {
    if (slot.at > sentThrough) {
      next = slot.at;
      break;
    }
  }
  if (plan.wakeAtMidnight && plan.midnight !== null) {
    const afterMidnight = plan.midnight + MINUTE_MS;
    next = next === null ? afterMidnight : Math.min(next, afterMidnight);
  }
  const anyGoals = [...plan.groups.values()].some((group) => group.kind === 'goals');
  if (next === null && anyGoals) next = now + 24 * 60 * MINUTE_MS;
  if (next === null) return null;
  return Math.min(Math.max(next, now + 1000), now + 24 * 60 * MINUTE_MS);
}
