import { router, type Href } from 'expo-router';

/**
 * Whether the one-time reprieve's page is open, or on its way. Like the loss
 * screen's (`loss-screen.ts`), it can be opened from more than one place in
 * the same moment (it landing, a tapped push), so it opens once.
 */
const open = new Set<string>();

/** Opens the reprieve's page, unless it's already open or opening. */
export function openGrace(graceId: string): void {
  if (open.has(graceId)) return;
  open.add(graceId);
  router.push(`/grace/${graceId}` as Href);
}

/** Marks the page open; call the returned function on close. */
export function watchGrace(graceId: string): () => void {
  open.add(graceId);
  return () => {
    open.delete(graceId);
  };
}
