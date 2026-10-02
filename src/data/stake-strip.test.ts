import { describe, expect, test } from 'vitest';

import { stakeStrip } from './stake-strip';

import type { Id } from '@/convex/_generated/dataModel';
import type { StakeView } from '@/convex/lib/stakeRules';

const LOST_AT = Date.UTC(2026, 8, 28, 12);

function money(fields: Partial<Extract<StakeView, { kind: 'money' }>>): StakeView {
  return {
    kind: 'money',
    _id: 'stake' as Id<'stakes'>,
    status: 'armed',
    amountCents: 2500,
    cardBrand: 'visa',
    cardLast4: '4242',
    ...fields,
  };
}

const friend = (status: 'armed' | 'told' | 'released' | 'void'): StakeView => ({
  kind: 'friend',
  _id: 'stake' as Id<'stakes'>,
  status,
  friendId: 'friend' as Id<'friends'>,
  friendName: 'Sam',
});

describe('stakeStrip', () => {
  test('just your word leads with nothing', () => {
    expect(stakeStrip(null)).toBeNull();
  });

  test('armed money leads with the amount and the card it comes off', () => {
    expect(stakeStrip(money({}))).toMatchObject({
      figure: '$25',
      label: 'on the line',
      note: 'Charged to Visa ••4242 if you miss.',
      tone: 'live',
    });
  });

  test('charged money is struck through, with the day it was missed', () => {
    expect(stakeStrip(money({ status: 'charged', lostAt: LOST_AT }))).toMatchObject({
      figure: '$25',
      label: 'charged',
      tone: 'lost',
      struck: true,
    });
  });

  test('money that made it through is kept', () => {
    expect(stakeStrip(money({ status: 'released' }))).toMatchObject({
      label: 'kept',
      tone: 'kept',
    });
  });

  test('a declined charge says so', () => {
    expect(stakeStrip(money({ status: 'charge_failed', failureKind: 'declined' }))).toMatchObject({
      label: 'card declined',
      tone: 'lost',
    });
  });

  test('a friend leads with their name', () => {
    expect(stakeStrip(friend('armed'))).toMatchObject({
      figure: 'Sam',
      label: 'is watching',
      note: 'Hears about it if you miss.',
      tone: 'live',
    });
    expect(stakeStrip(friend('told'))).toMatchObject({ tone: 'lost' });
  });

  test('a lockout leads with how long the freeze is', () => {
    const lockout: StakeView = {
      kind: 'lockout',
      _id: 'stake' as Id<'stakes'>,
      status: 'armed',
      days: 7,
    };
    expect(stakeStrip(lockout)).toMatchObject({
      figure: '1 week',
      note: 'Every habit freezes if you miss.',
      tone: 'live',
    });
  });

  test('paused without Pro, a live stake goes quiet', () => {
    expect(stakeStrip(money({}), { paused: true })).toMatchObject({
      figure: '$25',
      tone: 'quiet',
      note: 'Paused while Ante Pro is off.',
    });
    // One that already came due stays as it was.
    expect(
      stakeStrip(money({ status: 'charged', lostAt: LOST_AT }), { paused: true }),
    ).toMatchObject({ tone: 'lost' });
  });
});
