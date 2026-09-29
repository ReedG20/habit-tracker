import { router, type Href } from 'expo-router';

/**
 * Which losses have their page open, or on its way. The page is opened from
 * three places (a loss landing, a tapped push, the dev preview) that can fire
 * in the same moment, before the first push has changed the pathname; going
 * through `openLoss` means the page opens once.
 */
const open = new Set<string>();

/** Opens the loss's page, unless it's already open or opening. */
export function openLoss(stakeId: string): void {
  if (open.has(stakeId)) return;
  open.add(stakeId);
  router.push(`/lost/${stakeId}` as Href);
}

/** Marks the loss's page open; call the returned function on close. */
export function watchLoss(stakeId: string): () => void {
  open.add(stakeId);
  return () => {
    open.delete(stakeId);
  };
}
