import type { Project } from '@/data/projects';

export type ProjectSectionId = 'inProgress' | 'done';

export type ProjectSection = {
  id: ProjectSectionId;
  title: string;
  projects: Project[];
};

/**
 * Completing a project is what drops it into `done`. `projects` arrives already
 * ordered by due date, then `order`.
 */
export function groupProjectsIntoSections(projects: Project[]): ProjectSection[] {
  const inProgress: Project[] = [];
  const done: Project[] = [];

  for (const project of projects) {
    if (project.completedAt !== undefined) {
      done.push(project);
    } else {
      inProgress.push(project);
    }
  }

  const sections: ProjectSection[] = [
    { id: 'inProgress', title: 'in progress', projects: inProgress },
    { id: 'done', title: 'done', projects: done },
  ];

  return sections.filter((section) => section.projects.length > 0);
}
