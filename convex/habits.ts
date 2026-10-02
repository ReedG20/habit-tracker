import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireCallOffOpen, voidDeal } from './callOff';
import { newIconFields, repickIconOnRename, requireNewIcon } from './commitmentIcons';
import { recordEndedHabit } from './endedHabits';
import { holdEvidence } from './evidence';
import { frozenDaysBetween } from './freezes';
import { friendInputValidator, resolveFriend } from './friends';
import { currentStreak } from './habitStreaks';
import { deleteMilestones } from './milestones';
import { getCurrentUserOrNull } from './lib/auth';
import { armComeback } from './lib/comebacks';
import { habitCallOffUntil, isCallOffOpen } from './lib/callOff';
import { authedAction, authedMutation, authedQuery } from './lib/customFunctions';
import { requireCommitmentIcon } from './lib/commitmentIcons';
import { requireCommitmentText } from './lib/commitmentText';
import { countThisWeek, daysBefore, STREAK_WINDOW_DAYS } from './lib/days';
import { DAILY, isValidTimesPerWeek, targetPerWeek } from './lib/frequency';
import { weekStartsOn } from './lib/habitWeek';
import { requirePro } from './lib/entitlements';
import { restartableBefore, snapEndDay, validEndDay } from './lib/endDate';
import { endingPlan, type EndingPlan } from './lib/ending';
import {
  devOverridesEnabled,
  localDay,
  requireDevOverrides,
  requireUnlocked,
  stakesV2Enabled,
} from './lib/lockout';
import { touchReminders } from './lib/notify';
import { requireRoomFor } from './limits';
import { proofMethodValidator, requireProofSettings, type ProofMethod } from './lib/proofMethods';
import {
  DEFAULT_LOCKOUT_DAYS,
  isStakeLive,
  stakeView,
  stakeViewValidator,
  type StakeView,
} from './lib/stakeRules';
import { releaseStake } from './lib/stakes';
import { lockoutDaysValidator, moneyFields } from './lib/stakeSchema';
import { excusedDays } from './lib/streaks';
import { armStake, reuseCard, verifySavedCard, type ArmSpec, type SavedCard } from './stakes';

const habitValidator = v.object({
  _id: v.id('habits'),
  _creationTime: v.number(),
  userId: v.id('users'),
  title: v.string(),
  description: v.optional(v.string()),
  timesPerWeek: v.optional(v.number()),
  order: v.number(),
  startDay: v.optional(v.string()),
  endsAfter: v.optional(v.string()),
  endsOn: v.optional(v.string()),
  stakeId: v.optional(v.id('stakes')),
  brokenAt: v.optional(v.number()),
  proofMethod: v.optional(proofMethodValidator),
  timerMinutes: v.optional(v.number()),
  callOffUntil: v.optional(v.number()),
  icon: v.optional(v.string()),
  iconChosen: v.optional(v.boolean()),
});

/**
 * Today's latest verification, only while the habit is still incomplete. That is
 * all the card needs: a `pending` row means "verifying", a `rejected` or
 * `failed` row carries the message to show under the title.
 */
const verificationSummaryValidator = v.object({
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
    v.literal('failed'),
  ),
  reason: v.optional(v.string()),
  method: v.optional(proofMethodValidator),
});

/** A habit plus the per-day state the list screen renders. */
const habitWithProgressValidator = v.object({
  ...habitValidator.fields,
  completedToday: v.boolean(),
  /** Logs so far this week (from the habit's week start to today); what weekly habits count toward. */
  weekCount: v.number(),
  /** In days for daily habits, in weeks for the rest; see `habitStreak`. */
  streak: v.number(),
  verification: v.union(verificationSummaryValidator, v.null()),
  /** What's on the line; `null` means just their word. */
  stakeView: v.union(stakeViewValidator, v.null()),
});

const completionValidator = v.object({
  _id: v.id('habitCompletions'),
  _creationTime: v.number(),
  userId: v.id('users'),
  habitId: v.id('habits'),
  day: v.string(),
  completedAt: v.number(),
});

export type HabitVerificationSummary = {
  status: Doc<'habitVerifications'>['status'];
  reason?: string;
};

export type HabitWithProgress = Doc<'habits'> & {
  completedToday: boolean;
  weekCount: number;
  streak: number;
  verification: HabitVerificationSummary | null;
  stakeView: StakeView | null;
};

export type AuthedCtx<T> = T & { user: Doc<'users'> };

async function getOwnedHabitOrNull(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  habitId: Id<'habits'>,
): Promise<Doc<'habits'> | null> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null || habit.userId !== ctx.user._id) {
    return null;
  }

  return habit;
}

export async function requireOwnedHabit(
  ctx: AuthedCtx<QueryCtx | MutationCtx>,
  habitId: Id<'habits'>,
): Promise<Doc<'habits'>> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null) {
    throw new Error('Habit not found');
  }

  if (habit.userId !== ctx.user._id) {
    throw new Error('Unauthorized: this habit belongs to another user');
  }

  return habit;
}

/** Bounds `list`'s window reads: two months of logs and checks across every habit. */
const MAX_LIST_ROWS = 5000;

/**
 * `today` comes from the client so the day boundary follows the device clock
 * and the query stays cacheable — reading `Date.now()` here would break both.
 *
 * Deliberately tolerates a missing user row rather than throwing: on first
 * sign-in this subscribes at the same moment `users.storeUser` runs, and the
 * query re-resolves by itself once that mutation lands.
 */
export const list = query({
  args: { today: v.string() },
  returns: v.array(habitWithProgressValidator),
  handler: async (ctx, args): Promise<HabitWithProgress[]> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return [];
    }

    const habits = await ctx.db
      .query('habits')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    // One bounded read covers today's checkmarks and most streaks; a longer
    // streak reads further back for its own habit (`currentStreak`).
    const windowStart = daysBefore(args.today, STREAK_WINDOW_DAYS);
    const recent = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).gte('day', windowStart))
      .take(MAX_LIST_ROWS);

    const daysByHabit = new Map<Id<'habits'>, Set<string>>();
    for (const completion of recent) {
      const days = daysByHabit.get(completion.habitId) ?? new Set<string>();
      days.add(completion.day);
      daysByHabit.set(completion.habitId, days);
    }

    // The window's checks excuse days for streaks; the card shows today's newest.
    const verifications = await ctx.db
      .query('habitVerifications')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id).gte('day', windowStart))
      .take(MAX_LIST_ROWS);
    const todaysVerifications = verifications.filter((row) => row.day === args.today);
    const excused = excusedDays(verifications);

    const frozen = await frozenDaysBetween(ctx, user._id, windowStart, args.today);
    const stakes = new Map<Id<'stakes'>, Doc<'stakes'>>();
    for (const habit of habits) {
      if (habit.stakeId === undefined) continue;
      const stake = await ctx.db.get('stakes', habit.stakeId);
      if (stake !== null) stakes.set(stake._id, stake);
    }

    const latestVerificationByHabit = new Map<Id<'habits'>, Doc<'habitVerifications'>>();
    for (const verification of todaysVerifications) {
      const current = latestVerificationByHabit.get(verification.habitId);
      if (current === undefined || verification.createdAt > current.createdAt) {
        latestVerificationByHabit.set(verification.habitId, verification);
      }
    }

    return await Promise.all(
      habits
        .sort((a, b) => a.order - b.order)
        .map(async (habit) => {
          const days = daysByHabit.get(habit._id) ?? new Set<string>();
          const completedToday = days.has(args.today);
          const latest = latestVerificationByHabit.get(habit._id);

          return {
            ...habit,
            completedToday,
            weekCount: countThisWeek(days, args.today, weekStartsOn(habit)),
            streak: await currentStreak(ctx, habit, args.today, {
              from: windowStart,
              done: days,
              excused: excused.get(habit._id) ?? new Set<string>(),
              frozen,
            }),
            verification:
              completedToday || latest === undefined
                ? null
                : { status: latest.status, reason: latest.reason, method: latest.method },
            stakeView: stakeViewOf(habit, stakes),
          };
        }),
    );
  },
});

function stakeViewOf(habit: Doc<'habits'>, stakes: Map<Id<'stakes'>, Doc<'stakes'>>) {
  const stake = habit.stakeId === undefined ? undefined : stakes.get(habit.stakeId);
  return stake === undefined ? null : stakeView(stake);
}

/** Null rather than a throw: a deleted habit's detail screen is an expected state. */
export const get = authedQuery({
  args: { habitId: v.id('habits') },
  returns: v.union(habitValidator, v.null()),
  handler: async (ctx, args): Promise<Doc<'habits'> | null> => {
    return await getOwnedHabitOrNull(ctx, args.habitId);
  },
});

export const stats = authedQuery({
  args: { habitId: v.id('habits'), today: v.string() },
  returns: v.union(
    v.object({
      total: v.number(),
      streak: v.number(),
      stakeView: v.union(stakeViewValidator, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const habit = await getOwnedHabitOrNull(ctx, args.habitId);
    if (habit === null) {
      return null;
    }

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .collect();

    const stake = habit.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);

    return {
      total: completions.length,
      streak: await currentStreak(ctx, habit, args.today),
      stakeView: stake === null ? null : stakeView(stake),
    };
  },
});

export const listCompletions = authedQuery({
  args: { habitId: v.id('habits'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(completionValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    const habit = await getOwnedHabitOrNull(ctx, args.habitId);
    if (habit === null) {
      return { page: [], isDone: true, continueCursor: '' };
    }

    return await ctx.db
      .query('habitCompletions')
      .withIndex('by_habit_and_day', (q) => q.eq('habitId', args.habitId))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

/** What a habit can be staked on, short of money (which needs a card: `createStaked`). */
const plainStakeValidator = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('lockout'), days: lockoutDaysValidator }),
  v.object({ kind: v.literal('friend'), friend: friendInputValidator }),
);

type PlainStake = typeof plainStakeValidator.type;

const newHabitFields = {
  title: v.string(),
  description: v.optional(v.string()),
  /** 1 to 7 days a week; omitted means every day. */
  timesPerWeek: v.optional(v.number()),
  /** Omitted means photo, which is what builds from before methods make. */
  proofMethod: v.optional(proofMethodValidator),
  /** Required for a timer habit, and only for one. */
  timerMinutes: v.optional(v.number()),
  /** The last day it counts (`lib/endDate.ts`); omitted means it runs until ended. */
  endsOn: v.optional(v.string()),
  ...newIconFields,
};

type NewHabitArgs = {
  title: string;
  description?: string;
  timesPerWeek?: number;
  proofMethod?: ProofMethod;
  timerMinutes?: number;
  endsOn?: string;
  icon?: string;
  iconChosen?: boolean;
};

type ValidHabitFields = {
  title: string;
  description?: string;
  timesPerWeek: number;
  proofMethod: ProofMethod;
  timerMinutes?: number;
  endsOn?: string;
  icon?: string;
  iconChosen?: true;
};

async function requireNewHabit(
  ctx: MutationCtx,
  user: Doc<'users'>,
  args: NewHabitArgs,
): Promise<ValidHabitFields> {
  await requireUnlocked(ctx, user._id);
  await requirePro(ctx, user._id);
  await requireRoomFor(ctx, user._id, 'habit');
  requireCommitmentText(args.title, args.description);
  const timesPerWeek = args.timesPerWeek ?? DAILY;
  if (!isValidTimesPerWeek(timesPerWeek)) {
    throw new ConvexError('A habit is due 1 to 7 days a week');
  }
  const proof = requireProofSettings(args, devOverridesEnabled());
  return {
    title: args.title,
    description: args.description,
    timesPerWeek,
    ...proof,
    endsOn: requireEndDay(user, timesPerWeek, args.endsOn),
    ...requireNewIcon(args),
  };
}

/**
 * The end date a new habit keeps: snapped to the end of one of its weeks if
 * it's weekly, and at least a week and at most a year out from today.
 */
function requireEndDay(
  user: Doc<'users'>,
  timesPerWeek: number,
  endsOn: string | undefined,
): string | undefined {
  if (endsOn === undefined) return undefined;
  const startDay = localDay(Date.now(), user.timeZone ?? 'UTC');
  const day = validEndDay({ timesPerWeek, startDay }, endsOn);
  if (day === null)
    throw new ConvexError('Pick an end date at least a week and at most a year out');
  return day;
}

/**
 * Changing a habit's terms while it can still be called off: the old one is
 * called off and deleted, and its window carries over to the new one. Runs
 * before the room and money checks, so what it held is free again in the
 * same transaction; a failure later rolls it all back.
 */
async function takeOverHabit(
  ctx: MutationCtx,
  user: Doc<'users'>,
  habitId: Id<'habits'>,
): Promise<number> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null || habit.userId !== user._id) throw new Error('Habit not found');
  const callOffUntil = requireCallOffOpen(
    habit,
    Date.now(),
    'It’s past the time to change this one',
  );
  await voidDeal(ctx, { habit });
  await deleteHabit(ctx, habit._id);
  return callOffUntil;
}

/**
 * `carried` is the window of the habit this one replaces, which it never
 * outlasts, so swapping terms can't stretch it.
 */
async function insertHabit(
  ctx: MutationCtx,
  user: Doc<'users'>,
  args: ValidHabitFields,
  carried?: number,
): Promise<Doc<'habits'>> {
  const existing = await ctx.db
    .query('habits')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect();

  const order = existing.reduce((max, habit) => Math.max(max, habit.order), -1) + 1;

  const habitId = await ctx.db.insert('habits', {
    userId: user._id,
    title: args.title,
    description: args.description,
    timesPerWeek: args.timesPerWeek,
    proofMethod: args.proofMethod,
    timerMinutes: args.timerMinutes,
    endsOn: args.endsOn,
    icon: args.icon,
    iconChosen: args.iconChosen,
    order,
    startDay: user.timeZone === undefined ? undefined : localDay(Date.now(), user.timeZone),
    callOffUntil: Math.min(habitCallOffUntil(Date.now(), user.timeZone), carried ?? Infinity),
  });
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null) throw new Error('Habit not found');
  return habit;
}

async function armPlain(
  ctx: MutationCtx,
  user: Doc<'users'>,
  habit: Doc<'habits'>,
  stake: PlainStake,
): Promise<void> {
  let spec: ArmSpec;
  switch (stake.kind) {
    case 'none':
      return;
    case 'lockout':
      spec = { kind: 'lockout', days: stake.days };
      break;
    case 'friend':
      spec = { kind: 'friend', friend: await resolveFriend(ctx, user, stake.friend) };
      break;
  }
  await armStake(ctx, { habit }, spec);
}

/**
 * A habit on a lockout, a friend, or the user's word. Builds from before
 * stakes send no `stake`, and get the lockout their screens still describe.
 * Money goes through `createStaked`.
 */
export const create = authedMutation({
  args: {
    ...newHabitFields,
    stake: v.optional(plainStakeValidator),
    /** A habit of theirs, still in its window, that this one takes the place of. */
    replaces: v.optional(v.id('habits')),
  },
  returns: v.id('habits'),
  handler: async (ctx, args): Promise<Id<'habits'>> => {
    const { replaces, stake, ...habitArgs } = args;
    const carried =
      replaces === undefined ? undefined : await takeOverHabit(ctx, ctx.user, replaces);
    const fields = await requireNewHabit(ctx, ctx.user, habitArgs);
    const habit = await insertHabit(ctx, ctx.user, fields, carried);
    await armPlain(ctx, ctx.user, habit, stake ?? { kind: 'lockout', days: DEFAULT_LOCKOUT_DAYS });
    await touchReminders(ctx, ctx.user._id);

    return habit._id;
  },
});

/** A habit with money on it, once the PaymentSheet saved the card (`stakes.beginMoney`). */
export const createStaked = authedAction({
  args: {
    ...newHabitFields,
    amountCents: v.number(),
    /** A card just saved through the PaymentSheet… */
    setupIntentId: v.optional(v.string()),
    /** …or the one the habit it replaces was on. */
    reuseFromStakeId: v.optional(v.id('stakes')),
    /** A habit of theirs, still in its window, that this one takes the place of. */
    replaces: v.optional(v.id('habits')),
  },
  returns: v.id('habits'),
  handler: async (ctx, args): Promise<Id<'habits'>> => {
    requireCommitmentText(args.title, args.description);
    let saved: SavedCard;
    if (args.setupIntentId !== undefined) {
      saved = await verifySavedCard(ctx, args.setupIntentId, args.amountCents);
    } else if (args.reuseFromStakeId !== undefined) {
      saved = await reuseCard(ctx, args.reuseFromStakeId, args.amountCents);
    } else {
      throw new ConvexError('Add a card for the stake');
    }
    const { kind: _kind, ...card } = saved;
    const habitId: Id<'habits'> = await ctx.runMutation(internal.habits.insertStaked, {
      userId: ctx.user._id,
      title: args.title,
      description: args.description,
      timesPerWeek: args.timesPerWeek,
      proofMethod: args.proofMethod,
      timerMinutes: args.timerMinutes,
      endsOn: args.endsOn,
      icon: args.icon,
      iconChosen: args.iconChosen,
      replaces: args.replaces,
      ...card,
    });
    return habitId;
  },
});

const moneyArgs = {
  amountCents: moneyFields.amountCents,
  stripeCustomerId: moneyFields.stripeCustomerId,
  stripePaymentMethodId: moneyFields.stripePaymentMethodId,
  stripeSetupIntentId: moneyFields.stripeSetupIntentId,
  cardBrand: moneyFields.cardBrand,
  cardLast4: moneyFields.cardLast4,
  cardFingerprint: moneyFields.cardFingerprint,
};

export const insertStaked = internalMutation({
  args: {
    userId: v.id('users'),
    ...newHabitFields,
    ...moneyArgs,
    replaces: v.optional(v.id('habits')),
  },
  returns: v.id('habits'),
  handler: async (ctx, args): Promise<Id<'habits'>> => {
    const user = await ctx.db.get('users', args.userId);
    if (user === null) throw new Error('User not found');
    const {
      userId: _userId,
      title,
      description,
      timesPerWeek,
      proofMethod,
      timerMinutes,
      endsOn,
      icon,
      iconChosen,
      replaces,
      ...card
    } = args;
    // Frees the old habit's slot and dollars before they're checked.
    const carried = replaces === undefined ? undefined : await takeOverHabit(ctx, user, replaces);
    const fields = await requireNewHabit(ctx, user, {
      title,
      description,
      timesPerWeek,
      proofMethod,
      timerMinutes,
      endsOn,
      icon,
      iconChosen,
    });
    const habit = await insertHabit(ctx, user, fields, carried);
    // Checks the cap and replays; throwing here rolls the habit back with it.
    await armStake(ctx, { habit }, { kind: 'money', ...card });
    await touchReminders(ctx, user._id);
    return habit._id;
  },
});

/**
 * Whether the habit can take new stakes: its streak broke (the stake is
 * spent), or nothing live is on it (none, or a friend who opted out). A live
 * stake can't be swapped out; that would be a way around it.
 */
async function requireRestartable(
  ctx: MutationCtx,
  user: Doc<'users'>,
  habitId: Id<'habits'>,
): Promise<Doc<'habits'>> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit === null || habit.userId !== user._id) throw new Error('Habit not found');
  if (habit.endsAfter !== undefined) throw new ConvexError('This habit is ending');
  if (!restartableBefore(habit, localDay(Date.now(), user.timeZone ?? 'UTC'))) {
    throw new ConvexError('This habit ends too soon to restart. Start a new one instead.');
  }
  await requirePro(ctx, user._id);
  // A broken habit isn't counted as active, so picking it back up needs a slot.
  if (habit.brokenAt !== undefined) {
    await requireRoomFor(ctx, user._id, 'habit');
    return habit;
  }
  if (habit.stakeId === undefined) return habit;

  const stake = await ctx.db.get('stakes', habit.stakeId);
  if (stake !== null && isStakeLive(stake)) {
    throw new ConvexError('This habit already has something on the line');
  }
  return habit;
}

/**
 * Picks the habit back up with new stakes. History stays; the streak starts
 * over, and today is free.
 */
async function restartHabit(ctx: MutationCtx, user: Doc<'users'>, habit: Doc<'habits'>) {
  const startDay =
    user.timeZone === undefined ? habit.startDay : localDay(Date.now(), user.timeZone);
  await ctx.db.patch('habits', habit._id, {
    brokenAt: undefined,
    stakeId: undefined,
    startDay,
    // Its weeks re-anchor on the new start, so a weekly end date moves to the end of one.
    endsOn:
      habit.endsOn === undefined ? undefined : snapEndDay({ ...habit, startDay }, habit.endsOn),
  });
  const fresh = await ctx.db.get('habits', habit._id);
  if (fresh === null) throw new Error('Habit not found');
  return fresh;
}

export const restart = authedMutation({
  args: { habitId: v.id('habits'), stake: plainStakeValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const habit = await requireRestartable(ctx, ctx.user, args.habitId);
    const fresh = await restartHabit(ctx, ctx.user, habit);
    await armPlain(ctx, ctx.user, fresh, args.stake);
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

/**
 * Restarts with money: a freshly saved card (`setupIntentId`), or the card an
 * earlier stake was on (`reuseFromStakeId`, "go again at the same amount").
 */
export const restartStaked = authedAction({
  args: {
    habitId: v.id('habits'),
    amountCents: v.number(),
    setupIntentId: v.optional(v.string()),
    reuseFromStakeId: v.optional(v.id('stakes')),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let card: SavedCard;
    if (args.setupIntentId !== undefined) {
      card = await verifySavedCard(ctx, args.setupIntentId, args.amountCents);
    } else if (args.reuseFromStakeId !== undefined) {
      card = await reuseCard(ctx, args.reuseFromStakeId, args.amountCents);
    } else {
      throw new ConvexError('Add a card for the stake');
    }
    const { kind: _kind, ...fields } = card;
    await ctx.runMutation(internal.habits.restartWithMoney, {
      userId: ctx.user._id,
      habitId: args.habitId,
      ...fields,
    });
    return null;
  },
});

export const restartWithMoney = internalMutation({
  args: { userId: v.id('users'), habitId: v.id('habits'), ...moneyArgs },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const user = await ctx.db.get('users', args.userId);
    if (user === null) throw new Error('User not found');
    const { userId: _userId, habitId, ...card } = args;
    const habit = await requireRestartable(ctx, user, habitId);
    const fresh = await restartHabit(ctx, user, habit);
    await armStake(ctx, { habit: fresh }, { kind: 'money', ...card });
    await touchReminders(ctx, user._id);
    return null;
  },
});

export const update = authedMutation({
  args: {
    habitId: v.id('habits'),
    title: v.optional(v.string()),
    // `null` clears the description; omitting it leaves the stored value alone.
    description: v.optional(v.union(v.string(), v.null())),
    /** Picked by hand, so it sticks through later renames. */
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const habit = await requireOwnedHabit(ctx, args.habitId);
    await requireUnlocked(ctx, ctx.user._id);
    requireCommitmentText(args.title ?? habit.title, args.description);
    requireCommitmentIcon(args.icon);

    // `patch` removes fields set to `undefined`, so only send what was provided.
    const fields: Partial<Doc<'habits'>> = {};
    if (args.title !== undefined) fields.title = args.title;
    if (args.description !== undefined) {
      fields.description = args.description ?? undefined;
    }
    if (args.icon !== undefined) {
      fields.icon = args.icon;
      fields.iconChosen = true;
    }

    if (Object.keys(fields).length > 0) {
      await ctx.db.patch('habits', args.habitId, fields);
    }
    await repickIconOnRename(ctx, { kind: 'habit', id: habit._id }, habit, args);

    return null;
  },
});

/**
 * What ending `habit` on `today` would do (`lib/ending.ts`). Before stakes v2
 * every habit sat under the re-entry fee lock, so every one counts as staked.
 * No time zone or accountable day yet means nothing has ever been judged.
 */
async function planEnding(
  ctx: QueryCtx | MutationCtx,
  user: Doc<'users'>,
  habit: Doc<'habits'>,
  today: string | null,
): Promise<EndingPlan> {
  if (today === null || user.accountableFrom === undefined) {
    return { kind: 'now', reason: 'not-started' };
  }
  const stake = habit.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  const stakeLive = !stakesV2Enabled() || (stake !== null && isStakeLive(stake));
  return endingPlan({ habit, stakeLive, today, accountableFrom: user.accountableFrom });
}

const endingPlanValidator = v.union(
  v.object({
    kind: v.literal('now'),
    reason: v.union(v.literal('nothing-on-the-line'), v.literal('not-started')),
  }),
  v.object({ kind: v.literal('notice'), lastDay: v.string() }),
);

/**
 * What `remove` would do if it ran today, so the screen can say so before the
 * tap. `null` once the habit is gone. Same rule as `remove`, so the two can't
 * disagree.
 */
export const endingTerms = authedQuery({
  args: { habitId: v.id('habits'), today: v.string() },
  returns: v.union(endingPlanValidator, v.null()),
  handler: async (ctx, args): Promise<EndingPlan | null> => {
    const habit = await getOwnedHabitOrNull(ctx, args.habitId);
    if (habit === null) return null;
    return await planEnding(ctx, ctx.user, habit, args.today);
  },
});

/**
 * Ends a habit. With something live on the line it only gives notice
 * (`lib/ending.ts`): it keeps counting through `endsAfter`, and the nightly
 * check removes it once that day has been judged. Otherwise quitting on the
 * night it is due would dodge the miss. In its first moments
 * (`lib/callOff.ts`) it can still be called off and goes at once. `force`
 * skips the wait, on dev and preview only.
 */
export const remove = authedMutation({
  args: { habitId: v.id('habits'), force: v.optional(v.boolean()) },
  returns: v.union(v.literal('deleted'), v.literal('scheduled')),
  handler: async (ctx, args): Promise<'deleted' | 'scheduled'> => {
    const habit = await requireOwnedHabit(ctx, args.habitId);
    await requireUnlocked(ctx, ctx.user._id);

    if (isCallOffOpen(habit.callOffUntil, Date.now())) {
      await voidDeal(ctx, { habit });
    } else if (args.force === true) {
      requireDevOverrides();
    } else if (habit.endsAfter !== undefined) {
      return 'scheduled';
    } else {
      const { timeZone } = ctx.user;
      const today = timeZone === undefined ? null : localDay(Date.now(), timeZone);
      const plan = await planEnding(ctx, ctx.user, habit, today);
      if (plan.kind === 'notice') {
        await ctx.db.patch('habits', args.habitId, { endsAfter: plan.lastDay });
        return 'scheduled';
      }
    }

    await deleteHabit(ctx, args.habitId);
    return 'deleted';
  },
});

/**
 * Takes back an ending: the habit carries on as if it had never been ended.
 * Refused once its last day has passed, since the days after it were never
 * going to be judged and must not start counting behind the user's back.
 */
export const keepGoing = authedMutation({
  args: { habitId: v.id('habits') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const habit = await requireOwnedHabit(ctx, args.habitId);
    await requireUnlocked(ctx, ctx.user._id);
    if (habit.endsAfter === undefined) return null;

    const { timeZone } = ctx.user;
    if (timeZone !== undefined && habit.endsAfter < localDay(Date.now(), timeZone)) {
      throw new ConvexError('This habit has already ended');
    }
    // An ending habit gave up its slot; another may have taken it since.
    if (habit.brokenAt === undefined) await requireRoomFor(ctx, ctx.user._id, 'habit');

    await ctx.db.patch('habits', args.habitId, { endsAfter: undefined });
    await touchReminders(ctx, ctx.user._id);
    return null;
  },
});

/**
 * The habit and everything logged against it, photos included. Its stake is
 * let go (the habit ended before it came due) and kept as a record. Proof
 * behind money that came due is held a while longer (`evidence.ts`). A short
 * summary stays behind for the Past list (`endedHabits.ts`); pass the Kept
 * screen's row when it finished clean.
 */
export async function deleteHabit(
  ctx: MutationCtx,
  habitId: Id<'habits'>,
  accomplishmentId?: Id<'accomplishments'>,
): Promise<void> {
  const habit = await ctx.db.get('habits', habitId);
  if (habit?.stakeId !== undefined) {
    const stake = await ctx.db.get('stakes', habit.stakeId);
    if (stake !== null) await releaseStake(ctx, stake);
  }
  const keepProof = await holdEvidence(ctx, { habitId });

  const completions = await ctx.db
    .query('habitCompletions')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
    .collect();

  if (habit !== null) await recordEndedHabit(ctx, habit, completions.length, accomplishmentId);
  for (const completion of completions) {
    await ctx.db.delete('habitCompletions', completion._id);
  }

  const verifications = await ctx.db
    .query('habitVerifications')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
    .collect();

  for (const verification of verifications) {
    // A pending check is no evidence, and would hold up the nightly check.
    if (keepProof && verification.status !== 'pending') continue;
    if (verification.photoId !== undefined) await ctx.storage.delete(verification.photoId);
    await ctx.db.delete('habitVerifications', verification._id);
  }

  const timerRuns = await ctx.db
    .query('habitTimerRuns')
    .withIndex('by_habit_and_day', (q) => q.eq('habitId', habitId))
    .collect();

  for (const run of timerRuns) {
    await ctx.db.delete('habitTimerRuns', run._id);
  }

  await deleteMilestones(ctx, habitId);
  await ctx.db.delete('habits', habitId);
  if (habit !== null) {
    await armComeback(ctx, habit.userId, {
      endedAt: Date.now(),
      outcome:
        accomplishmentId !== undefined ? 'kept' : habit.brokenAt !== undefined ? 'missed' : 'ended',
      title: habit.title,
      accomplishmentId,
    });
  }
}

/**
 * Total completions across every habit. Used on Me; a full-table count is
 * fine while the product is still personal-scale.
 */
export const loggedCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const user = await getCurrentUserOrNull(ctx);
    if (user === null) {
      return 0;
    }

    const completions = await ctx.db
      .query('habitCompletions')
      .withIndex('by_user_and_day', (q) => q.eq('userId', user._id))
      .collect();

    return completions.length;
  },
});
