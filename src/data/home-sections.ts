import { isMissed, type GoalWithStatus } from '@/data/goals';
import { isDoneForToday, mustLogToday, type HabitWithProgress } from '@/data/habits';
import { endOfDay } from '@/lib/dates';

/** `deadlineAt` is set on urgent habits only: the card counts down to it. */
export type HomeItem =
  | { kind: 'habit'; habit: HabitWithProgress; deadlineAt?: number }
  | { kind: 'goal'; goal: GoalWithStatus };

export type HomeSectionId = 'urgent' | 'goals' | 'habits';

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

/**
 * Urgent holds what needs acting on today: habits with a setback, and weekly
 * habits out of slack (skipping today would end the week short). Goals still
 * in play follow, soonest first, with missed ones after so a charge is never
 * hidden; done goals only show on Commitments. Everything else stays in the
 * habits list, with what is done for today, or for the week, sinking to the
 * bottom. Both inputs arrive already ordered.
 */
export function groupIntoHomeSections(
  habits: HabitWithProgress[],
  goals: GoalWithStatus[],
  today: string,
  now: number,
): HomeSection[] {
  const urgent: HomeItem[] = [];
  const upcoming: HomeItem[] = [];
  const completed: HomeItem[] = [];
  const activeGoals: HomeItem[] = [];
  const missedGoals: HomeItem[] = [];

  for (const habit of habits) {
    if (isSetback(habit) || mustLogToday(habit, today)) {
      urgent.push({ kind: 'habit', habit, deadlineAt: endOfDay(today) });
    } else if (isDoneForToday(habit)) {
      completed.push({ kind: 'habit', habit });
    } else {
      upcoming.push({ kind: 'habit', habit });
    }
  }

  for (const goal of goals) {
    if (goal.completedAt !== undefined) continue;
    (isMissed(goal, now) ? missedGoals : activeGoals).push({ kind: 'goal', goal });
  }

  const sections: HomeSection[] = [
    { id: 'urgent', title: 'urgent', items: urgent },
    { id: 'goals', title: 'goals', items: [...activeGoals, ...missedGoals] },
    { id: 'habits', title: 'habits', items: [...upcoming, ...completed] },
  ];

  return sections.filter((section) => section.items.length > 0);
}
