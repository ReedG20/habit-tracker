import { router, type Href } from 'expo-router';

/**
 * Which milestone pages are open, or on their way, so each opens once. Same
 * guard as `kept-screen.ts`: the presenter, a tapped push and the dev preview
 * can fire together.
 */
const open = new Set<string>();

/** Opens the milestone's page, unless it's already open or opening. */
export function openMilestone(milestoneId: string): void {
  if (open.has(milestoneId)) return;
  open.add(milestoneId);
  router.push(`/milestone/${milestoneId}` as Href);
}

/** Marks the page open; call the returned function on close. */
export function watchMilestone(milestoneId: string): () => void {
  open.add(milestoneId);
  return () => {
    open.delete(milestoneId);
  };
}
