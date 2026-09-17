import type { Doc } from '@/convex/_generated/dataModel';

export type Habit = Doc<'habits'>;
export type HabitCompletion = Doc<'habitCompletions'>;

/** What `api.habits.list` returns: a habit plus today's state and its streak. */
export type HabitWithProgress = Habit & {
  completedToday: boolean;
  streak: number;
};
