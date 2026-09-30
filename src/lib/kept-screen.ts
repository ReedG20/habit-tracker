import { router, type Href } from 'expo-router';

/**
 * Which Kept pages are open, or on their way, so each opens once. Same guard
 * as `loss-screen.ts`: the presenter and the dev preview can fire together.
 */
const open = new Set<string>();

/** Opens the accomplishment's page, unless it's already open or opening. */
export function openKept(accomplishmentId: string): void {
  if (open.has(accomplishmentId)) return;
  open.add(accomplishmentId);
  router.push(`/kept/${accomplishmentId}` as Href);
}

/** Marks the page open; call the returned function on close. */
export function watchKept(accomplishmentId: string): () => void {
  open.add(accomplishmentId);
  return () => {
    open.delete(accomplishmentId);
  };
}
