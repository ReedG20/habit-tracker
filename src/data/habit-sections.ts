import type { Habit } from '@/data/habits';

export type HabitSectionId = 'urgent' | 'commitments';

export type HabitSection = {
  id: HabitSectionId;
  title: string;
  habits: Habit[];
};

/**
 * Temporary client-side grouping until sections are driven by Convex.
 * Gym (dumbbell) → urgent; everything else → commitments.
 */
export function groupHabitsIntoSections(habits: Habit[]): HabitSection[] {
  const urgent: Habit[] = [];
  const commitments: Habit[] = [];

  for (const habit of habits) {
    if (habit.iconKey === 'dumbbell') {
      urgent.push(habit);
    } else {
      commitments.push(habit);
    }
  }

  const sections: HabitSection[] = [
    { id: 'urgent', title: 'urgent', habits: urgent },
    { id: 'commitments', title: 'your commitments', habits: commitments },
  ];

  return sections.filter((section) => section.habits.length > 0);
}
