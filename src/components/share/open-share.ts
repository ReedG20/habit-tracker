import { router } from 'expo-router';

import type { Id } from '@/convex/_generated/dataModel';
import type { ShareCardKind, ShareSource } from '@/data/share-copy';

export type ShareTarget =
  { habitId: Id<'habits'> } | { goalId: Id<'goals'> } | { accomplishmentId: Id<'accomplishments'> };

/** Opens the share sheet for one commitment, on `card` when it has a choice. */
export function openShare(target: ShareTarget, source: ShareSource, card?: ShareCardKind) {
  router.push({
    pathname: '/share',
    params: { ...target, source, ...(card !== undefined && { card }) },
  });
}
