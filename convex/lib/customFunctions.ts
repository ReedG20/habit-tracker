import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions';

import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import { action, mutation, query } from '../_generated/server';
import { getCurrentUser } from './auth';

/**
 * Query, mutation and action builders that resolve the signed-in user up front
 * and expose it as `ctx.user`, so handlers never repeat the auth check.
 */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await getCurrentUser(ctx) })),
);

/** Actions have no `ctx.db`, so the user row comes through a query. */
export const authedAction = customAction(
  action,
  customCtx(async (ctx) => {
    const user: Doc<'users'> = await ctx.runQuery(internal.users.current, {});
    return { user };
  }),
);
