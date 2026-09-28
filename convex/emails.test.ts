import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { register as registerResend } from '@convex-dev/resend/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { setup as baseSetup, signIn, type Harness } from './test.helpers';

function setup(): Harness {
  const t = baseSetup();
  registerRateLimiter(t);
  registerResend(t);
  return t;
}

async function namedFriend(t: Harness) {
  const alice = await signIn(t, 'alice');
  const habitId = await alice.as.mutation(api.habits.create, {
    title: 'Run',
    stake: { kind: 'friend', friend: { name: 'Sam', email: 'sam@example.com' } },
  });
  const token = await t.run(async (ctx) => (await ctx.db.query('friends').first())!.optOutToken);
  return { alice, habitId, token };
}

const friendStatus = (t: Harness) =>
  t.run(async (ctx) => (await ctx.db.query('friends').first())!.status);

beforeEach(() => {
  vi.stubEnv('STAKES_V2', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('opting out', () => {
  test('opening the link only shows the choices', async () => {
    const t = setup();
    const { token } = await namedFriend(t);

    const response = await t.fetch(`/email/opt-out?t=${token}`, { method: 'GET' });
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('Stop emails about alice');
    expect(await friendStatus(t)).toBe('active');
  });

  test('a one-click unsubscribe stops emails from that user only', async () => {
    const t = setup();
    const { token } = await namedFriend(t);

    const response = await t.fetch(`/email/opt-out?t=${token}`, {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
    });
    expect(response.status).toBe(200);
    expect(await friendStatus(t)).toBe('opted_out');
    const suppressed = await t.run(async (ctx) => await ctx.db.query('emailSuppressions').collect());
    expect(suppressed).toHaveLength(0);
  });

  test('an unknown token changes nothing', async () => {
    const t = setup();
    await namedFriend(t);
    const response = await t.fetch('/email/opt-out?t=nope&scope=all', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(await friendStatus(t)).toBe('active');
  });
});

describe('delivery reports', () => {
  test('a hard bounce suppresses the address and voids the stake', async () => {
    const t = setup();
    const { habitId } = await namedFriend(t);

    await t.mutation(internal.emails.handleEmailEvent, {
      id: 'email_1' as never,
      event: {
        type: 'email.bounced',
        created_at: '2026-09-21T00:00:00Z',
        data: {
          created_at: '2026-09-21T00:00:00Z',
          email_id: 'em_1',
          from: 'Ante <hello@mail.useanteapp.com>',
          to: ['sam@example.com'],
          subject: 'alice put you on the hook',
          bounce: { message: 'No such user', subType: 'General', type: 'Permanent' },
        },
      },
    });

    expect(await friendStatus(t)).toBe('bounced');
    const stake = await t.run(async (ctx) => {
      const habit = await ctx.db.get('habits', habitId);
      return await ctx.db.get('stakes', habit!.stakeId!);
    });
    expect(stake).toMatchObject({ status: 'void' });
  });

  test('without EMAIL_DELIVERY nothing leaves Convex', async () => {
    const t = setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await namedFriend(t);
    await t.finishAllScheduledFunctions(() => {});
    expect(log.mock.calls.some(([line]) => String(line).startsWith('[email not sent]'))).toBe(true);
    log.mockRestore();
  });
});
