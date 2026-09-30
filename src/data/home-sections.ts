import { isMissed, type GoalWithStatus } from '@/data/goals';
import { isDaily, isDoneForToday, mustLogToday, type HabitWithProgress } from '@/data/habits';
import { weekEnd } from '@/convex/lib/days';
import { endOfDay } from '@/lib/dates';

/** `deadlineAt` is set on urgent habits only: the card counts down to it. */
export type HomeItem =
  | { kind: 'habit'; habit: HabitWithProgress; deadlineAt?: number }
  | { kind: 'goal'; goal: GoalWithStatus };

export type HomeSectionId = 'today' | 'upcoming' | 'done' | 'missed' | 'paused';

export type HomeSection = {
  id: HomeSectionId;
  title: string;
  items: HomeItem[];
};

/** A photo that came back rejected or failed: the user has to try again today. */
function isSetback(habit: HabitWithProgress): boolean {
  const status = habit.verification?.status;
  return !isDoneForToday(habit) && (status === 'rejected' || status === 'failed');
}

function isPending(habit: HabitWithProgress): boolean {
  return !isDoneForToday(habit) && habit.verification?.status === 'pending';
}

type Sorted = { item: HomeItem; key: number };

function byDeadline(entries: Sorted[]): HomeItem[] {
  // `sort` is stable, so equal deadlines keep the order the lists arrived in.
  return entries.sort((a, b) => a.key - b.key).map((entry) => entry.item);
}

/**
 * The home list is ordered by what needs thinking about now, not by kind:
 *
 * - today: what has to happen before midnight. Setbacks lead, then everything
 *   else by deadline, so a goal due at 6 pm sits above tonight's habits.
 * - coming up: weekly habits that still have slack, and goals due later.
 * - done: done for today or the week, plus proof waiting on review (the
 *   user's part is done; a rejection sends it back up).
 * - missed: goals past their deadline, last but never hidden, since a charge
 *   should always be visible.
 * - paused: without Ante Pro, every habit, below it all. Nothing is owed on
 *   them, so they must not crowd out goals that still settle.
 */
export function groupIntoHomeSections(
  habits: HabitWithProgress[],
  goals: GoalWithStatus[],
  today: string,
  now: number,
  { paused = false }: { paused?: boolean } = {},
): HomeSection[] {
  const midnight = endOfDay(today);
  const sunday = endOfDay(weekEnd(today));
  const dueToday: Sorted[] = [];
  const upcoming: Sorted[] = [];
  const done: HomeItem[] = [];
  const missed: HomeItem[] = [];
  const pausedHabits: HomeItem[] = [];

  for (const habit of habits) {
    if (paused) {
      pausedHabits.push({ kind: 'habit', habit });
    } else if (isDoneForToday(habit) || isPending(habit)) {
      done.push({ kind: 'habit', habit });
    } else if (isSetback(habit)) {
      dueToday.push({ item: { kind: 'habit', habit, deadlineAt: midnight }, key: -Infinity });
    } else if (mustLogToday(habit, today)) {
      dueToday.push({ item: { kind: 'habit', habit, deadlineAt: midnight }, key: midnight });
    } else if (isDaily(habit)) {
      dueToday.push({ item: { kind: 'habit', habit }, key: midnight });
    } else {
      upcoming.push({ item: { kind: 'habit', habit }, key: sunday });
    }
  }

  for (const goal of goals) {
    if (goal.completedAt !== undefined) continue;
    const item: HomeItem = { kind: 'goal', goal };
    if (isMissed(goal, now)) {
      missed.push(item);
    } else if (goal.submission?.status === 'pending') {
      done.push(item);
    } else {
      (goal.dueAt < midnight ? dueToday : upcoming).push({ item, key: goal.dueAt });
    }
  }

  const sections: HomeSection[] = [
    { id: 'today', title: 'today', items: byDeadline(dueToday) },
    { id: 'upcoming', title: 'coming up', items: byDeadline(upcoming) },
    { id: 'done', title: 'done', items: done },
    { id: 'missed', title: 'missed', items: missed },
    { id: 'paused', title: 'paused', items: pausedHabits },
  ];

  return sections.filter((section) => section.items.length > 0);
}
