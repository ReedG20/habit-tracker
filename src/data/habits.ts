import type { Doc } from '@/convex/_generated/dataModel';

export type Habit = Doc<'habits'>;
export type HabitCompletion = Doc<'habitCompletions'>;
export type HabitVerification = Doc<'habitVerifications'>;

/** Today's latest verification while the habit is still incomplete; see `habits.list`. */
export type HabitVerificationSummary = {
  status: HabitVerification['status'];
  reason?: string;
};

/** What `api.habits.list` returns: a habit plus today's state and its streak. */
export type HabitWithProgress = Habit & {
  completedToday: boolean;
  streak: number;
  verification: HabitVerificationSummary | null;
};
