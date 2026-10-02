import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { json, SECRET_KEY } from './stripeFake.helpers';
import { grantPro, setup as baseSetup, type Harness } from './test.helpers';

// convex-test keeps no content type on stored files, so without this no photo
// gets past the image check. The vision call itself stays real.
vi.mock('./lib/vision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/vision')>()),
  IMAGE_CONTENT_TYPES: new Set(['', 'image/jpeg']),
}));

/**
 * When proof can't be judged because of us (the model provider is out of
 * credits or down, Places has no key), the attempt resolves `failed`, and a
 * failed check must never cost the user: the habit's day is excused, a goal's
 * stake is let go at its deadline, nothing is charged and the one-time grace
 * isn't spent. These go through the real actions with the providers failing
 * at the network, not with the verdict stubbed.
 */

// 2026-09-21 is a Monday. Everyone here lives in UTC, so the local day ends at 03:00Z.
const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const HERE = { latitude: 40.6745, longitude: -73.9903, accuracy: 20 };

type Seen = { host: string; status: number };
let seen: Seen[] = [];
/** What the model provider (OpenRouter) answers with. */
let modelResponse: () => Response;

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function signIn(t: Harness, tokenIdentifier: string) {
  const as = t.withIdentity({
    tokenIdentifier,
    name: tokenIdentifier,
    email: `${tokenIdentifier}@example.com`,
  });
  const userId: Id<'users'> = await as.mutation(api.users.storeUser, { timeZone: 'UTC' });
  await grantPro(t, userId);
  return { as, userId };
}

async function moneyHabit(
  t: Harness,
  userId: Id<'users'>,
  proofMethod: 'photo' | 'location' = 'photo',
): Promise<Id<'habits'>> {
  return await t.mutation(internal.habits.insertStaked, {
    userId,
    title: 'Climb',
    description: 'Any climbing gym',
    proofMethod,
    amountCents: 2500,
    stripeCustomerId: 'cus_test',
    stripePaymentMethodId: 'pm_test',
    stripeSetupIntentId: `seti_${Math.random()}`,
  });
}

async function photo(t: Harness): Promise<Id<'_storage'>> {
  return await t.run(
    async (ctx) => await ctx.storage.store(new Blob(['jpeg bytes'], { type: 'image/jpeg' })),
  );
}

/** Runs every scheduled function due now (the analysis), wave by wave. */
async function runDue(t: Harness) {
  for (let wave = 0; wave < 10; wave += 1) {
    const due = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      return jobs.filter((job) => job.state.kind === 'pending' && job.scheduledTime <= Date.now())
        .length;
    });
    if (due === 0) return;
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
  }
}

/** The signup day (Monday) is free; Tuesday is the first day that counts. */
const DAY = '2026-09-22';

async function runCheck(t: Harness, day: string, hour = 4) {
  vi.setSystemTime(at(day, hour));
  await t.mutation(internal.lockouts.checkAll, {});
}

async function verification(t: Harness, id: Id<'habitVerifications'>) {
  return await t.run(async (ctx) => await ctx.db.get('habitVerifications', id));
}

async function stakeOfHabit(t: Harness, habitId: Id<'habits'>) {
  return await t.run(async (ctx) => {
    const habit = await ctx.db.get('habits', habitId);
    return habit?.stakeId === undefined ? null : await ctx.db.get('stakes', habit.stakeId);
  });
}

async function chargeJobs(t: Harness) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query('_scheduled_functions').collect();
    return jobs.filter((job) => job.name === 'stripe:chargeStake');
  });
}

async function graceUsed(t: Harness, userId: Id<'users'>) {
  return await t.run(async (ctx) => (await ctx.db.get('users', userId))?.graceUsedAt !== undefined);
}

const outOfCredits = () =>
  json(
    {
      error: {
        code: 402,
        message: 'Insufficient credits. Add more using https://openrouter.ai/credits',
      },
    },
    402,
  );

const rejectVerdict = () =>
  json({
    id: 'gen-1',
    object: 'chat.completion',
    created: 0,
    model: 'google/gemini-2.5-flash-lite',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            verdict: 'reject',
            reason: 'That looks like a desk, not a gym.',
          }),
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at('2026-09-21'));
  vi.stubEnv('STAKES_V2', 'on');
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test');
  vi.stubEnv('STRIPE_SECRET_KEY', SECRET_KEY);
  vi.stubEnv('GOOGLE_PLACES_API_KEY', '');
  seen = [];
  modelResponse = outOfCredits;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url,
      );
      const response =
        url.hostname === 'openrouter.ai'
          ? modelResponse()
          : url.hostname === 'api.stripe.com'
            ? json({ error: { type: 'api_error', message: 'unexpected charge' } }, 500)
            : json({});
      seen.push({ host: url.hostname, status: response.status });
      return response;
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('habits', () => {
  test('a photo the model provider can’t judge (402) excuses the day: no charge, grace kept', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at(DAY));

    const id = await alice.as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await photo(t),
    });
    // Judged straight away.
    await runDue(t);

    expect(seen).toContainEqual({ host: 'openrouter.ai', status: 402 });
    expect(await verification(t, id)).toMatchObject({
      status: 'failed',
      reason: "Couldn't verify the photo. Try again.",
    });

    await runCheck(t, '2026-09-23');
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'armed' });
    expect(await chargeJobs(t)).toEqual([]);
    expect(await graceUsed(t, alice.userId)).toBe(false);
    expect(seen.filter((call) => call.host === 'api.stripe.com')).toEqual([]);
    expect(
      (await t.run(async (ctx) => await ctx.db.get('habits', habitId)))?.brokenAt,
    ).toBeUndefined();
  });

  test('a check-in with no Places key on the deployment excuses the day', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId, 'location');
    vi.setSystemTime(at(DAY));

    const id = await alice.as.mutation(api.locationProofs.submit, {
      habitId,
      day: DAY,
      ...HERE,
    });
    await runDue(t);

    expect(await verification(t, id)).toMatchObject({ status: 'failed' });
    // Nothing went out: the key check fails before Google or the model is called.
    expect(seen).toEqual([]);

    await runCheck(t, '2026-09-23');
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'armed' });
    expect(await chargeJobs(t)).toEqual([]);
    expect(await graceUsed(t, alice.userId)).toBe(false);
  });

  test('a later attempt that the model does judge is what counts', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at(DAY));
    await t.run(async (ctx) => await ctx.db.patch('users', alice.userId, { graceUsedAt: 1 }));

    const failed = await alice.as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await photo(t),
    });
    await runDue(t);
    expect(await verification(t, failed)).toMatchObject({ status: 'failed' });

    // Credits topped up; the retake is judged, and rejected.
    vi.advanceTimersByTime(60_000);
    modelResponse = rejectVerdict;
    const judged = await alice.as.mutation(api.verifications.submit, {
      habitId,
      day: DAY,
      photoId: await photo(t),
    });
    await runDue(t);
    expect(await verification(t, judged)).toMatchObject({ status: 'rejected' });

    await runCheck(t, '2026-09-23');
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'charging' });
    expect(await chargeJobs(t)).toHaveLength(1);
  });

  test('a check that never reports back expires as failed, which excuses the day too', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const habitId = await moneyHabit(t, alice.userId);
    vi.setSystemTime(at(DAY));
    const lastCheckedDay = async () =>
      (await t.run(async (ctx) => await ctx.db.get('users', alice.userId)))?.lastCheckedDay;
    const before = await lastCheckedDay();
    // An analysis that never reported back: the row is still pending.
    const id = await t.run(async (ctx) =>
      ctx.db.insert('habitVerifications', {
        userId: alice.userId,
        habitId,
        day: DAY,
        method: 'photo',
        status: 'pending',
        createdAt: Date.now(),
      }),
    );
    // While it's pending the nightly check waits rather than judging the day.
    await runCheck(t, '2026-09-23');
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'armed' });
    expect(await lastCheckedDay()).toBe(before);

    await t.mutation(internal.verifications.expire, { verificationId: id });
    expect(await verification(t, id)).toMatchObject({ status: 'failed' });
    await runCheck(t, '2026-09-23', 5);
    expect(await stakeOfHabit(t, habitId)).toMatchObject({ status: 'armed' });
    expect(await chargeJobs(t)).toEqual([]);
  });

  // RISK (not fixed here): "failed" is whatever makes the model call throw, and
  // the only gate before it is the upload's declared content type
  // (`verifications.submit`, `goalSubmissions.create`). Bytes that claim to be
  // image/jpeg but aren't one make the provider 400, which resolves `failed`
  // and excuses the day (or, for a goal, releases the whole stake). A user who
  // finds this can skip any day for free. Needs a decision: e.g. count only
  // provider/infra errors (402/429/5xx/timeouts) as `failed`, and treat a 4xx
  // about the input as `rejected`.
  test.todo('an undecodable upload is rejected, not excused');
});

describe('goals', () => {
  test('a goal whose last proof couldn’t be judged is let go at the deadline, uncharged', async () => {
    const t = setup();
    const alice = await signIn(t, 'alice');
    const dueAt = at('2026-09-25').getTime();
    const goalId = await t.mutation(internal.goals.insertStaked, {
      userId: alice.userId,
      title: 'Ship the app',
      description: 'A screenshot of the App Store listing',
      dueAt,
      amountCents: 5000,
      stripeCustomerId: 'cus_test',
      stripePaymentMethodId: 'pm_test',
      stripeSetupIntentId: 'seti_goal',
    });
    const stakeId = (await t.run(async (ctx) => await ctx.db.get('goals', goalId)))!.stakeId!;

    vi.setSystemTime(dueAt - 60 * 60 * 1000);
    const submissionId = await alice.as.mutation(api.goalSubmissions.create, {
      goalId,
      photoIds: [await photo(t)],
    });
    await runDue(t);
    expect(
      await t.run(async (ctx) => await ctx.db.get('goalSubmissions', submissionId)),
    ).toMatchObject({ status: 'failed' });

    // The deadline job.
    vi.setSystemTime(dueAt);
    await t.mutation(internal.stakes.resolveGoal, { stakeId, attempt: 0 });

    expect(await t.run(async (ctx) => await ctx.db.get('stakes', stakeId))).toMatchObject({
      status: 'released',
    });
    expect(await chargeJobs(t)).toEqual([]);
    expect(await graceUsed(t, alice.userId)).toBe(false);
  });
});
