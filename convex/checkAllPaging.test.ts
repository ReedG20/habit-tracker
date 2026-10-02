import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { grantPro, setup as baseSetup, spendGrace, type Harness } from './test.helpers';

/**
 * `lockouts.checkAll` reads users 50 at a time and chains itself until the
 * table is done. Nobody past the first page may be skipped: a skipped user is
 * a miss that's never charged, and a check that's late by a day.
 */

const USERS = 120;
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

/** The continuation `checkAll` scheduled for itself, if any. */
async function nextPage(t: Harness): Promise<{ cursor: string | null } | null> {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    const pending = jobs.filter(
      (job) => job.name === 'lockouts:checkAll' && job.state.kind === 'pending',
    );
    if (pending.length > 1) throw new Error('checkAll chained more than once');
    return pending.length === 0 ? null : (pending[0].args[0] as { cursor: string | null });
  });
}

/** Runs `checkAll` the way the cron does, following its chain by hand. Returns how many pages ran. */
async function runCheckAll(t: Harness): Promise<number> {
  await t.mutation(internal.lockouts.checkAll, {});
  let pages = 1;
  for (let next = await nextPage(t); next !== null; next = await nextPage(t)) {
    // Retire the scheduled copy so the chain is followed exactly once.
    await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      for (const job of jobs) {
        if (job.name === 'lockouts:checkAll' && job.state.kind === 'pending') {
          await ctx.scheduler.cancel(job._id);
        }
      }
    });
    await t.mutation(internal.lockouts.checkAll, { cursor: next.cursor });
    pages += 1;
    if (pages > 20) throw new Error('checkAll never finished');
  }
  return pages;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('lockouts.checkAll', () => {
  test(`checks every one of ${USERS} users, across pages of 50`, async () => {
    const t = setup();
    const habits: Id<'habits'>[] = [];
    const users: Id<'users'>[] = [];
    for (let i = 0; i < USERS; i += 1) {
      const as = t.withIdentity({ tokenIdentifier: `user-${i}`, name: `User ${i}` });
      const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
      await grantPro(t, userId);
      await spendGrace(t, userId);
      users.push(userId);
      habits.push(
        await t.mutation(internal.habits.insertStaked, {
          userId,
          title: 'Run',
          amountCents: 500,
          stripeCustomerId: `cus_${i}`,
          stripePaymentMethodId: `pm_${i}`,
          stripeSetupIntentId: `seti_${i}`,
        }),
      );
    }

    // Monday went unproven for everyone; the check just after it ends.
    vi.setSystemTime(at('2026-09-23', 4));
    const pages = await runCheckAll(t);

    expect(pages).toBe(Math.ceil(USERS / 50));
    const result = await t.run(async (ctx) => {
      const checked = await Promise.all(users.map((id) => ctx.db.get('users', id)));
      const stakes = await Promise.all(
        habits.map(async (habitId) => {
          const habit = await ctx.db.get('habits', habitId);
          return habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
        }),
      );
      return {
        lastChecked: checked.map((user) => user?.lastCheckedDay),
        statuses: stakes.map((stake) => stake?.status),
      };
    });
    expect(result.lastChecked).toEqual(Array(USERS).fill('2026-09-22'));
    expect(result.statuses).toEqual(Array(USERS).fill('charging'));
    const charges = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs.filter((job) => job.name === 'stripe:chargeStake').length;
    });
    expect(charges).toBe(USERS);

    // Running it again the same hour checks nobody twice.
    expect(await runCheckAll(t)).toBe(Math.ceil(USERS / 50));
    const again = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs.filter((job) => job.name === 'stripe:chargeStake').length;
    });
    expect(again).toBe(USERS);
  });
});
