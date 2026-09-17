import { customCtx, customMutation, customQuery } from 'convex-helpers/server/customFunctions';

import { mutation, query } from '../_generated/server';
import { getCurrentUser } from './auth';

/**
 * Query and mutation builders that resolve the signed-in user up front and
 * expose it as `ctx.user`, so handlers never repeat the auth check.
 */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) })),
);
