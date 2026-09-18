import type { HabitWithProgress } from '@/data/habits';
import type { Project } from '@/data/projects';
import { endOfDay, isOverdue } from '@/lib/dates';

/** `deadlineAt` is set on urgent items only: the card counts down to it. */
export type HomeItem =
  | { kind: 'habit'; habit: HabitWithProgress; deadlineAt?: number }
  | { kind: 'project'; project: Project; deadlineAt?: number };

export type HomeSectionId = 'urgent' | 'habits' | 'projects';

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

function isPressing(project: Project, today: string): boolean {
  return (
    project.completedAt === undefined &&
    project.dueDay !== undefined &&
    (project.dueDay === today || isOverdue(project.dueDay, today))
  );
}

/**
 * Urgent holds what needs acting on today: habits with a setback, and projects
 * due today or overdue. Everything else keeps its list, with what is done today
 * sinking to the bottom. Both inputs arrive already ordered.
 */
export function groupIntoHomeSections(
  habits: HabitWithProgress[],
  projects: Project[],
  today: string,
): HomeSection[] {
  const urgent: HomeItem[] = [];
  const upcomingHabits: HomeItem[] = [];
  const completedHabits: HomeItem[] = [];
  const openProjects: HomeItem[] = [];
  const doneProjects: HomeItem[] = [];

  for (const habit of habits) {
    if (isSetback(habit)) {
      urgent.push({ kind: 'habit', habit, deadlineAt: endOfDay(today) });
    } else if (habit.completedToday) {
      completedHabits.push({ kind: 'habit', habit });
    } else {
      upcomingHabits.push({ kind: 'habit', habit });
    }
  }

  for (const project of projects) {
    if (isPressing(project, today)) {
      // `dueDay` is defined whenever `isPressing` holds.
      urgent.push({ kind: 'project', project, deadlineAt: endOfDay(project.dueDay ?? today) });
    } else if (project.completedAt !== undefined) {
      doneProjects.push({ kind: 'project', project });
    } else {
      openProjects.push({ kind: 'project', project });
    }
  }

  const sections: HomeSection[] = [
    { id: 'urgent', title: 'urgent', items: urgent },
    { id: 'habits', title: 'habits', items: [...upcomingHabits, ...completedHabits] },
    { id: 'projects', title: 'projects', items: [...openProjects, ...doneProjects] },
  ];

  return sections.filter((section) => section.items.length > 0);
}
