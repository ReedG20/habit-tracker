import { useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import type { StakeView } from '@/convex/lib/stakeRules';

/**
 * The address a friend stake's emails go to, for the commitment's terms.
 * Only friends who can still be emailed are listed, so one who opted out has none.
 */
export function useFriendEmail(stake: StakeView | null | undefined): string | undefined {
  const friends = useQuery(api.friends.list, stake?.kind === 'friend' ? {} : 'skip');
  if (stake?.kind !== 'friend') return undefined;
  return friends?.find((friend) => friend._id === stake.friendId)?.email;
}
