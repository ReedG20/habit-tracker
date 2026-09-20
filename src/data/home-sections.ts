import type { HabitWithProgress } from '@/data/habits';
import { endOfDay } from '@/lib/dates';

/** `deadlineAt` is set on urgent items only: the card counts down to it. */
export type HomeItem = { habit: HabitWithProgress; deadlineAt?: number };

export type HomeSectionId = 'urgent' | 'habits';

export type HomeSection = {
  id: HomeSectionId;
  title: string;
  items: HomeItem[];
};

/** A photo that came back rejected or failed: the user has to try again today. */
function isSetback(habit: HabitWithProgress): boolean {
  const status = habit.verification?.status;
  return !habit.completedToday && (status === 'rejected' || status === 'failed');
}

/**
 * Urgent holds what needs acting on today: habits with a setback. Everything
 * else stays in the main list, with what is done today sinking to the bottom.
 * The input arrives already ordered.
 */
export function groupIntoHomeSections(habits: HabitWithProgress[], today: string): HomeSection[] {
  const urgent: HomeItem[] = [];
  const upcoming: HomeItem[] = [];
  const completed: HomeItem[] = [];

  for (const habit of habits) {
    if (isSetback(habit)) {
      urgent.push({ habit, deadlineAt: endOfDay(today) });
    } else if (habit.completedToday) {
      completed.push({ habit });
    } else {
      upcoming.push({ habit });
    }
  }

  const sections: HomeSection[] = [
    { id: 'urgent', title: 'urgent', items: urgent },
    { id: 'habits', title: 'habits', items: [...upcoming, ...completed] },
  ];

  return sections.filter((section) => section.items.length > 0);
}
