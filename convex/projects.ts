import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type MutationCtx } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { authedMutation, authedQuery } from './lib/customFunctions';

const projectValidator = v.object({
  _id: v.id('projects'),
  _creationTime: v.number(),
  userId: v.id('users'),
  title: v.string(),
  description: v.optional(v.string()),
  dueDay: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  order: v.number(),
});

type AuthedMutationCtx = MutationCtx & { user: Doc<'users'> };

async function requireOwnedProject(
  ctx: AuthedMutationCtx,
  projectId: Id<'projects'>,
): Promise<Doc<'projects'>> {
  const project = await ctx.db.get('projects', projectId);
  if (project === null) {
    throw new Error('Project not found');
  }

  if (project.userId !== ctx.user._id) {
    throw new Error('Unauthorized: this project belongs to another user');
  }

  return project;
}

/**
 * Same tolerance as `habits.list`: a missing user row on first sign-in resolves
 * itself once `users.storeUser` lands.
 */
export const list = query({
  args: {},
  returns: v.array(projectValidator),
  handler: async (ctx): Promise<Doc<'projects'>[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return [];
    }

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    // Soonest due date first, then undated, so what's pressing stays on top.
    return projects.sort((a, b) => {
      if (a.dueDay !== b.dueDay) {
        if (a.dueDay === undefined) return 1;
        if (b.dueDay === undefined) return -1;
        return a.dueDay < b.dueDay ? -1 : 1;
      }

      return a.order - b.order;
    });
  },
});

export const get = authedQuery({
  args: { projectId: v.id('projects') },
  returns: v.union(projectValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<'projects'> | null> => {
    const project = await ctx.db.get('projects', args.projectId);
    if (project === null || project.userId !== ctx.user._id) {
      return null;
    }

    return project;
  },
});

export const create = authedMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    dueDay: v.optional(v.string()),
  },
  returns: v.id('projects'),
  handler: async (ctx, args): Promise<Id<'projects'>> => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .collect();

    const order = existing.reduce((max, project) => Math.max(max, project.order), -1) + 1;

    return await ctx.db.insert('projects', {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      dueDay: args.dueDay,
      order,
    });
  },
});

export const update = authedMutation({
  args: {
    projectId: v.id('projects'),
    title: v.optional(v.string()),
    // `null` clears the field; omitting it leaves the stored value alone.
    description: v.optional(v.union(v.string(), v.null())),
    dueDay: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOwnedProject(ctx, args.projectId);

    const fields: Partial<Doc<'projects'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.description !== undefined) {
      fields.description = args.description ?? undefined;
    }
    if (args.dueDay !== undefined) {
      fields.dueDay = args.dueDay ?? undefined;
    }

    if (Object.keys(fields).length > 0) {
      await ctx.db.patch('projects', args.projectId, fields);
    }

    return null;
  },
});

/** Marks the project done, or reopens it if it already was. */
export const toggleDone = authedMutation({
  args: { projectId: v.id('projects') },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const project = await requireOwnedProject(ctx, args.projectId);
    const done = project.completedAt === undefined;

    await ctx.db.patch('projects', args.projectId, {
      completedAt: done ? Date.now() : undefined,
    });

    return done;
  },
});

export const remove = authedMutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await requireOwnedProject(ctx, args.projectId);
    await ctx.db.delete('projects', args.projectId);

    return null;
  },
});
