import type { HabitWithProgress } from '@/data/habits';

export type HabitSectionId = 'upcoming' | 'completed';

export type HabitSection = {
  id: HabitSectionId;
  title: string;
  habits: HabitWithProgress[];
};

/**
 * Splitting on today's completion is what makes a habit drop to the bottom of
 * the screen the moment it is logged. `habits` arrives already ordered.
 */
export function groupHabitsIntoSections(habits: HabitWithProgress[]): HabitSection[] {
  const upcoming: HabitWithProgress[] = [];
  const completed: HabitWithProgress[] = [];

  for (const habit of habits) {
    if (habit.completedToday) {
      completed.push(habit);
    } else {
      upcoming.push(habit);
    }
  }

  const sections: HabitSection[] = [
    { id: 'upcoming', title: 'coming up', habits: upcoming },
    { id: 'completed', title: 'completed', habits: completed },
  ];

  return sections.filter((section) => section.habits.length > 0);
}
