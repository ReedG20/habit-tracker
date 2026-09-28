import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { authedMutation, authedQuery } from './lib/customFunctions';
import { weekStart } from './lib/days';
import { isPro } from './lib/entitlements';
import { activeLockout } from './lib/lockout';
import {
  deliver,
  grantedTokens,
  reminderSettings,
  touchReminders,
  type PushMessage,
} from './lib/notify';
import { formatDueLabel, reminderCopy, type ReminderMessage } from './lib/reminderCopy';
import {
  nextWake,
  planReminders,
  selectDue,
  type Group,
  type PlanGoal,
  type PlanHabit,
  type PlanInput,
  type Slot,
} from './lib/reminderPlan';
import { PRESET_RULES, type ReminderSettings } from './lib/reminderPresets';
import { zonedDay } from './lib/zonedTime';

/**
 * Deadline reminders, one self-rescheduling run per user. Each run rebuilds the
 * plan from fresh data (`lib/reminderPlan.ts`), sends whatever is due, and
 * schedules itself for the next slot. `touchReminders` (`lib/notify.ts`)
 * restarts the chain after anything that could move a reminder earlier.
 */

const settingsValidator = v.object({
  preset: v.union(v.literal('gentle'), v.literal('firm'), v.literal('relentless')),
  morningLineup: v.boolean(),
  breakThroughFocus: v.boolean(),
  approvals: v.boolean(),
});

const HOUR_MS = 60 * 60 * 1000;
/** Bounds on what one run reads; far above what anyone has open. */
const MAX_GOALS = 200;
const MAX_HABITS = 100;

export const settings = authedQuery({
  args: {},
  returns: settingsValidator,
  handler: async (ctx): Promise<ReminderSettings> => {
    return await reminderSettings(ctx, ctx.user._id);
  },
});

export const updateSettings = authedMutation({
  args: settingsValidator.partial().fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const current = await reminderSettings(ctx, ctx.user._id);
    const next: ReminderSettings = {
      preset: args.preset ?? current.preset,
      morningLineup: args.morningLineup ?? current.morningLineup,
      breakThroughFocus: args.breakThroughFocus ?? current.breakThroughFocus,
      approvals: args.approvals ?? current.approvals,
    };

    const row = await ctx.db
      .query('notificationSettings')
      .withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
      .unique();
    if (row === null) {
      await ctx.db.insert('notificationSettings', {
        userId: ctx.user._id,
        ...next,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch('notificationSettings', row._id, { ...next, updatedAt: Date.now() });
    }

    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

/** Everything the planner needs about one user, read in this run's transaction. */
async function loadPlanInput(
  ctx: MutationCtx,
  user: Doc<'users'>,
  settings: ReminderSettings,
  now: number,
): Promise<PlanInput> {
  // Newest first: finished goals pile up over time, and open ones are recent.
  const goalRows = await ctx.db
    .query('goals')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .order('desc')
    .take(MAX_GOALS);

  const goals: PlanGoal[] = [];
  for (const goal of goalRows) {
    if (goal.completedAt !== undefined || goal.dueAt <= now) continue;
    const latest = await ctx.db
      .query('goalSubmissions')
      .withIndex('by_goal', (q) => q.eq('goalId', goal._id))
      .order('desc')
      .first();
    goals.push({
      _id: goal._id,
      title: goal.title,
      dueAt: goal.dueAt,
      createdAt: goal._creationTime,
      stakeCents: goal.stake?.status === 'armed' ? goal.stake.amountCents : null,
      pending: latest?.status === 'pending',
    });
  }

  const input: PlanInput = {
    now,
    timeZone: user.timeZone,
    accountableFrom: user.accountableFrom,
    locked: (await activeLockout(ctx, user._id)) !== null,
    settings,
    goals,
    habits: [],
  };
  if (user.timeZone === undefined) return input;
  // Without Ante Pro habits are paused (`lockouts.checkUser`): nothing to remind about.
  if (!(await isPro(ctx, user._id, now))) return input;

  const today = zonedDay(now, user.timeZone);
  const from = weekStart(today);
  const habitRows = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .take(MAX_HABITS);
  if (habitRows.length === 0) return input;

  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', from).lte('day', today),
    )
    .take(MAX_HABITS * 7);
  const checks = await ctx.db
    .query('habitVerifications')
    .withIndex('by_user_and_day', (q) =>
      q.eq('userId', user._id).gte('day', from).lte('day', today),
    )
    .take(MAX_HABITS * 7 * 4);

  const done = new Map<Id<'habits'>, Set<string>>();
  const mark = (habitId: Id<'habits'>, day: string) => {
    const days = done.get(habitId) ?? new Set<string>();
    days.add(day);
    done.set(habitId, days);
  };
  for (const completion of completions) mark(completion.habitId, completion.day);

  // Same rule as the lockout check: a day whose latest check failed on our side is excused.
  const latest = new Map<string, Doc<'habitVerifications'>>();
  for (const check of checks) {
    const key = `${check.habitId}|${check.day}`;
    const seen = latest.get(key);
    if (seen === undefined || check.createdAt > seen.createdAt) latest.set(key, check);
  }
  const pending = new Set<Id<'habits'>>();
  for (const check of latest.values()) {
    if (check.status === 'failed') mark(check.habitId, check.day);
    if (check.status === 'pending' && check.day === today) pending.add(check.habitId);
  }

  input.habits = habitRows.map((habit): PlanHabit => ({
    _id: habit._id,
    title: habit.title,
    timesPerWeek: habit.timesPerWeek,
    startDay: habit.startDay,
    endsAfter: habit.endsAfter,
    done: done.get(habit._id) ?? new Set<string>(),
    pending: pending.has(habit._id),
  }));
  return input;
}

const seconds = (ms: number) => Math.floor(ms / 1000);

/**
 * The push for one due slot, from what is still open right now. Anything with
 * a photo being checked counts as handled; if it's rejected, the rejection push
 * says how long is left. `null` when nothing in the group needs a word.
 */
function composePush(
  group: Group,
  slot: Slot,
  /** Which nudge this is for its deadline, so the wording rotates. */
  step: number,
  settings: ReminderSettings,
  now: number,
  timeZone: string,
): PushMessage | null {
  let message: ReminderMessage;
  let url = '/';

  if (group.kind === 'habits') {
    const habits = group.habits.filter((habit) => !habit.pending);
    if (habits.length === 0) return null;
    message = {
      kind: 'habits',
      habits: habits.map((habit) => ({ title: habit.title, weeklyNeeded: habit.weeklyNeeded })),
      msLeft: group.deadline - now,
      final: slot.final,
      seed: slot.group,
      step,
    };
  } else if (group.kind === 'goals') {
    const goals = group.goals.filter((goal) => !goal.pending);
    if (goals.length === 0) return null;
    if (goals.length === 1) url = `/goals/${goals[0]._id}`;
    message = {
      kind: 'goals',
      goals: goals.map((goal) => ({ title: goal.title, stakeCents: goal.stakeCents })),
      dueLabel: formatDueLabel(group.deadline, now, timeZone),
      msLeft: group.deadline - now,
      final: slot.final,
      seed: slot.group,
      step,
    };
  } else {
    const habits = group.habits.filter((habit) => !habit.pending);
    const goals = group.goals.filter((goal) => !goal.pending && goal.dueAt > now);
    if (habits.length === 0 && goals.length === 0) return null;
    message = {
      kind: 'lineup',
      habits: habits.map((habit) => habit.title),
      goals: goals.map((goal) => ({
        title: goal.title,
        stakeCents: goal.stakeCents,
        dueLabel: formatDueLabel(goal.dueAt, now, timeZone),
      })),
    };
  }

  const lineup = group.kind === 'lineup';
  const breakThrough = slot.final && settings.breakThroughFocus;
  return {
    ...reminderCopy(message),
    data: { kind: lineup ? 'lineup' : 'reminder', url, final: slot.final },
    // Each nudge for a deadline replaces the one before it in Notification Center.
    collapseId: slot.group,
    threadId: group.kind,
    interruptionLevel: breakThrough ? 'time-sensitive' : 'active',
    // The lineup is a glance, not an alarm.
    sound: lineup ? undefined : 'default',
    // An early nudge that can't arrive within the hour isn't worth arriving at all.
    expiration: seconds(slot.final ? group.deadline : Math.min(group.deadline, now + HOUR_MS)),
    relevanceScore: slot.final ? 1 : lineup ? 0.4 : 0.6,
  };
}

/**
 * One step of a user's reminder chain. A run whose `generation` is behind has
 * been replaced by a newer plan and stops. A run that fails to plan retries in
 * an hour rather than dropping the chain.
 */
export const runUser = internalMutation({
  args: { userId: v.id('users'), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const state = await ctx.db
      .query('reminderState')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (state === null || state.generation !== args.generation) return null;

    const user = await ctx.db.get('users', args.userId);
    const tokens = await grantedTokens(ctx, args.userId);
    if (user === null || tokens.length === 0) {
      await ctx.db.patch('reminderState', state._id, { jobId: undefined });
      return null;
    }

    const now = Date.now();
    const settings = await reminderSettings(ctx, user._id);
    const timeZone = user.timeZone ?? 'UTC';

    let plan;
    try {
      plan = planReminders(await loadPlanInput(ctx, user, settings, now));
    } catch (error: unknown) {
      console.error('Planning reminders failed', args.userId, error);
      const jobId = await ctx.scheduler.runAfter(HOUR_MS, internal.reminders.runUser, args);
      await ctx.db.patch('reminderState', state._id, { jobId });
      return null;
    }

    const today = zonedDay(now, timeZone);
    const { due, sentThrough, sentToday } = selectDue(
      plan.slots,
      state,
      now,
      today,
      PRESET_RULES[settings.preset].dailyCap,
    );

    const messages: PushMessage[] = [];
    for (const slot of due) {
      const group = plan.groups.get(slot.group);
      if (group === undefined) continue;
      const step = plan.slots.filter((candidate) => candidate.group === slot.group).indexOf(slot);
      const push = composePush(group, slot, step, settings, now, timeZone);
      if (push !== null) messages.push(push);
    }
    await deliver(ctx, user._id, messages, tokens);

    const wake = nextWake(plan, sentThrough, now);
    const jobId =
      wake === null ? undefined : await ctx.scheduler.runAt(wake, internal.reminders.runUser, args);

    await ctx.db.patch('reminderState', state._id, {
      sentThrough,
      // `selectDue` counted every slot it picked; only the ones that said something count.
      sentToday: sentToday - (due.length - messages.length),
      day: today,
      lastPushAt: messages.length > 0 ? now : state.lastPushAt,
      jobId,
    });
    return null;
  },
});
