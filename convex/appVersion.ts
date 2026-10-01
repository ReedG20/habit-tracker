import { v } from 'convex/values';

import { env, query } from './_generated/server';

/**
 * The oldest iOS build still allowed to run, from `MIN_IOS_BUILD`, or `null`
 * for no gate. No auth: an outdated build has to be stopped before sign-in too.
 * Anything that isn't a positive whole number counts as unset, so a typo never
 * locks everyone out.
 */
export const minimumIosBuild = query({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (): Promise<number | null> => {
    const raw = env.MIN_IOS_BUILD?.trim();
    if (!raw || !/^\d+$/.test(raw)) return null;
    const build = Number(raw);
    return build > 0 ? build : null;
  },
});
