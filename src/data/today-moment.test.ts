import { describe, expect, test } from 'vitest';

import type { GoalWithStatus } from './goals';
import type { HabitWithProgress } from './habits';
import {
  formatHoursMinutes,
  MARGIN_NOTES,
  splitEmphasis,
  pickTodayMoment,
  type TodayMomentInput,
} from './today-moment';

import type { Id } from '@/convex/_generated/dataModel';
import { endOfDay } from '@/lib/dates';

// A Tuesday: six days left in the week, today included.
const TUESDAY = '2026-09-29';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIDNIGHT = endOfDay(TUESDAY);
const MORNING = MIDNIGHT - 16 * HOUR;
const STAKE_ID = 'stake' as Id<'stakes'>;
const TEN_DOLLARS = {
  kind: 'money' as const,
  _id: STAKE_ID,
  status: 'armed' as const,
  amountCents: 1000,
};

let nextId = 0;
function habit(fields: Partial<HabitWithProgress>): HabitWithProgress {
  nextId += 1;
  return {
    _id: `habit${nextId}` as Id<'habits'>,
    _creationTime: 0,
    userId: 'user' as Id<'users'>,
    title: `Habit ${nextId}`,
    order: nextId,
    completedToday: false,
    weekCount: 0,
    streak: 0,
    verification: null,
    stakeView: TEN_DOLLARS,
    ...fields,
  };
}

function goal(fields: Partial<GoalWithStatus> & { stakeCents?: number }): GoalWithStatus {
  nextId += 1;
  const { stakeCents, ...rest } = fields;
  return {
    _id: `goal${nextId}` as Id<'goals'>,
    _creationTime: 0,
    userId: 'user' as Id<'users'>,
    title: `Goal ${nextId}`,
    order: nextId,
    dueAt: MIDNIGHT + 4 * DAY,
    submission: null,
    stakeView:
      stakeCents === undefined
        ? null
        : { kind: 'money', _id: STAKE_ID, status: 'armed', amountCents: stakeCents },
    ...rest,
  };
}

function pick(input: Partial<TodayMomentInput>) {
  return pickTodayMoment({
    habits: [],
    goals: [],
    today: TUESDAY,
    now: MORNING,
    accountableFrom: null,
    frozenUntil: null,
    ...input,
  });
}

describe('formatHoursMinutes', () => {
  test('reads like a clock, rounding up', () => {
    expect(formatHoursMinutes(80 * 60_000)).toBe('1h 20m');
    expect(formatHoursMinutes(3 * HOUR)).toBe('3h');
    expect(formatHoursMinutes(45 * 60_000 - 1)).toBe('45m');
    expect(formatHoursMinutes(1)).toBe('1m');
  });
});

describe('pickTodayMoment', () => {
  test('is null with nothing to show, so the empty state takes over', () => {
    expect(pick({})).toBeNull();
  });

  test('leads with the streak a skip would end', () => {
    const gym = habit({ title: 'Gym', streak: 23 });
    const moment = pick({ habits: [gym] });
    expect(moment).toMatchObject({
      kind: 'streak',
      figure: { kind: 'streak', streak: { count: 23, unit: 'day' } },
      sentence: 'Log Gym today to make it day 24.',
    });
    expect(moment?.kicker).toBe('Streak on the line');
    expect(moment?.also.slice(0, 2)).toEqual(['Skip it and $10 is charged', '16h left today']);
  });

  test('counts only the streaks still owed, not the headline', () => {
    const gym = habit({ title: 'Gym', streak: 23, completedToday: true });
    const read = habit({ title: 'Read', streak: 1 });
    const moment = pick({ habits: [gym, read] });
    expect(moment?.kind).toBe('stakes');
    expect(moment?.kicker).toBe('Skip Read today and it costs');
    expect(moment?.figure).toMatchObject({ kind: 'money', text: '$10' });
    expect(moment?.sentence).toContain('day 2 is yours');
  });

  test('a new run leads with the money', () => {
    const moment = pick({ habits: [habit({ title: 'Walk', streak: 0 })] });
    expect(moment).toMatchObject({ kind: 'stakes', sentence: expect.stringContaining('day 1') });
  });

  test('without money, the clock stands in and the stake is named', () => {
    const friend = {
      kind: 'friend' as const,
      _id: STAKE_ID,
      status: 'armed' as const,
      friendId: 'f' as Id<'friends'>,
      friendName: 'Sam',
    };
    expect(pick({ habits: [habit({ title: 'Walk', stakeView: friend })] })).toMatchObject({
      kind: 'stakes',
      kicker: 'Skip Walk and Sam hears about it',
      figure: { kind: 'time', text: '16h' },
    });
    const lockout = {
      kind: 'lockout' as const,
      _id: STAKE_ID,
      status: 'armed' as const,
      days: 3 as const,
    };
    expect(pick({ habits: [habit({ title: 'Walk', stakeView: lockout })] })?.kicker).toBe(
      'Skip Walk and your habits freeze for 3 days',
    );
    expect(pick({ habits: [habit({ title: 'Walk', stakeView: null })] })?.kicker).toBe(
      'Skip Walk and the streak starts over',
    );
  });

  test('while frozen, nothing is owed and the thaw is the headline', () => {
    const gym = habit({ title: 'Gym', streak: 23 });
    const moment = pick({ habits: [gym], frozenUntil: MIDNIGHT + 2 * DAY });
    expect(moment).toMatchObject({
      kind: 'frozen',
      kicker: 'Your habits are frozen',
      figure: { kind: 'time', text: '2 days' },
    });
    expect(moment?.sentence).toContain('Goals still count.');
  });

  test('a broken habit owes nothing, and waits to be restarted', () => {
    const run = habit({ title: 'Run', brokenAt: 1, stakeView: null });
    const moment = pick({ habits: [run, habit({ title: 'Gym', streak: 23 })] });
    expect(moment?.kind).toBe('streak');
    expect(moment?.also).toContain('Run: streak lost. Restart it');
  });

  test('last call beats the streak', () => {
    const gym = habit({ title: 'Gym', streak: 23 });
    const moment = pick({ habits: [gym], now: MIDNIGHT - 80 * 60_000 });
    expect(moment).toMatchObject({
      kind: 'lastCall',
      tone: 'urgent',
      figure: { kind: 'time', text: '1h 20m' },
      sentence: 'Gym’s still open. Skip it and your 23-day streak ends, and $10 is charged.',
    });
  });

  test('a staked goal inside three hours beats last call', () => {
    const now = MIDNIGHT - 2 * HOUR;
    const run = goal({ title: 'Run a 5K', dueAt: now + HOUR, stakeCents: 2500 });
    const moment = pick({ habits: [habit({ streak: 23 })], goals: [run], now });
    expect(moment).toMatchObject({
      kind: 'goalCrunch',
      kicker: 'Due in 1h',
      figure: { kind: 'money', amount: 25, text: '$25' },
    });
    expect(moment?.sentence).toContain('riding on Run a 5K');
  });

  test('a staked goal due tonight beats the streak', () => {
    const run = goal({ title: 'Run a 5K', dueAt: MIDNIGHT - 4 * HOUR, stakeCents: 2500 });
    const moment = pick({ habits: [habit({ streak: 23 })], goals: [run] });
    expect(moment?.kind).toBe('goalToday');
  });

  test('a goal days away stays in the also line', () => {
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    const moment = pick({ habits: [habit({ title: 'Gym', streak: 23 })], goals: [run] });
    expect(moment?.kind).toBe('streak');
    expect(moment?.also.some((line) => line.startsWith('Run a 5K: $25 on it'))).toBe(true);
  });

  test('a rejected photo comes first', () => {
    const gym = habit({ title: 'Gym', streak: 23, verification: { status: 'rejected' } });
    const moment = pick({ habits: [gym], now: MIDNIGHT - HOUR });
    expect(moment).toMatchObject({
      kind: 'retake',
      kicker: 'Your Gym photo didn’t pass',
      sentence: 'to retake it before midnight. Your 23-day streak’s still alive.',
    });
  });

  test('a failed check is excused, so it owes nothing', () => {
    const gym = habit({ title: 'Gym', verification: { status: 'failed' } });
    expect(pick({ habits: [gym] })).toMatchObject({
      kind: 'clear',
      kicker: 'Nothing on the line today',
    });
  });

  test('a habit made today is free', () => {
    const walk = habit({ title: 'Walk', startDay: TUESDAY });
    expect(pick({ habits: [walk] })).toMatchObject({
      kind: 'clear',
      sentence: 'Walk starts counting tomorrow.',
    });
  });

  test('the day back from a lock is free', () => {
    const gym = habit({ title: 'Gym', streak: 0 });
    expect(pick({ habits: [gym], accountableFrom: '2026-09-30' })).toMatchObject({
      kind: 'clear',
      kicker: 'Nothing on the line today',
      sentence: 'Your day back is free. Everything counts again tomorrow.',
      note: 'free day. it all counts tomorrow.',
    });
    // Even when a goal takes the headline, the note still says why.
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    expect(pick({ habits: [gym], goals: [run], accountableFrom: '2026-09-30' })).toMatchObject({
      figure: { kind: 'money', text: '$25' },
      note: 'free day. it all counts tomorrow.',
    });
    // From then on it counts as usual.
    expect(pick({ habits: [gym], accountableFrom: TUESDAY })?.kind).toBe('stakes');
  });

  test('all done points at the next goal', () => {
    const gym = habit({ title: 'Gym', streak: 24, completedToday: true });
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    const moment = pick({ habits: [gym], goals: [run] });
    expect(moment).toMatchObject({
      kind: 'clear',
      tone: 'done',
      kicker: 'Today’s done',
      figure: { kind: 'streak', streak: { count: 24, unit: 'day' } },
    });
    expect(moment?.sentence).toBe('in a row. Today’s in the bank.');
    expect(moment?.also.some((line) => line.startsWith('Run a 5K: $25 on it, due '))).toBe(true);
    expect(moment?.also).toContain('6 days to a 30-day streak');
  });

  test('waiting on review says so, without a note', () => {
    const gym = habit({ streak: 5, verification: { status: 'pending' } });
    expect(pick({ habits: [gym] })).toMatchObject({
      kind: 'clear',
      kicker: 'Proof’s in review',
      note: null,
    });
  });

  test('a goals-only user sees the next stake', () => {
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    expect(pick({ goals: [run] })).toMatchObject({
      kind: 'clear',
      kicker: 'Next up',
      figure: { kind: 'money', text: '$25' },
    });
  });

  test('an unstaked goal counts down in days', () => {
    const run = goal({ title: 'Run a 5K', dueAt: MORNING + 4 * DAY + HOUR });
    expect(pick({ goals: [run] })).toMatchObject({
      figure: { kind: 'time', text: '4 days' },
      sentence: 'until Run a 5K is due.',
    });
  });

  describe('weekly habits', () => {
    test('with slack owe nothing today', () => {
      const stretch = habit({ title: 'Stretch', timesPerWeek: 3, weekCount: 1 });
      expect(pick({ habits: [stretch] })).toMatchObject({
        kind: 'clear',
        sentence: 'Stretch: 2 more this week.',
      });
    });

    test('out of slack are on the line in weeks', () => {
      const stretch = habit({ title: 'Stretch', timesPerWeek: 7, weekCount: 0, streak: 0 });
      expect(pick({ habits: [stretch] })?.kind).toBe('stakes');

      // Sunday, one log short.
      const sunday = '2026-10-04';
      const moment = pickTodayMoment({
        habits: [habit({ title: 'Swim', timesPerWeek: 2, weekCount: 1, streak: 5 })],
        goals: [],
        today: sunday,
        now: endOfDay(sunday) - 10 * HOUR,
        accountableFrom: null,
        frozenUntil: null,
      });
      expect(moment).toMatchObject({
        kind: 'streak',
        figure: { streak: { count: 5, unit: 'week' } },
        sentence: 'Swim needs today to keep the run going.',
      });
    });
  });
});

describe('pickTodayMoment, several habits', () => {
  test('a skip means any one of them', () => {
    const moment = pick({ habits: [habit({ title: 'Walk' }), habit({ title: 'Read' })] });
    expect(moment?.kicker).toBe('Skip any of today’s 2 habits and it costs');
    expect(moment?.sentence).toContain('Log them and');
  });

  test('the streak names the run at risk', () => {
    const moment = pick({ habits: [habit({ title: 'Gym', streak: 23 }), habit({ streak: 2 })] });
    expect(moment?.sentence).toBe('Log Gym today to make it day 24. One more habit after that.');
  });
});

describe('pickTodayMoment, last call with several habits', () => {
  test("doesn't pin the streak on a skip that wouldn't end it", () => {
    const habits = [habit({ title: 'Gym', streak: 23 }), habit({ title: 'Read' })];
    const moment = pick({ habits, now: MIDNIGHT - HOUR });
    expect(moment?.sentence).toBe('2 habits are still open. Skip one and $10 is charged.');
    expect(moment?.also).toContain('Gym: 23 days in a row');
  });
});

describe('pickTodayMoment, margin notes', () => {
  test('are lowercase and fit on one line', () => {
    for (const note of Object.values(MARGIN_NOTES).flat()) {
      expect(note).toMatch(/^[^A-Z']+$/);
      expect(note.length).toBeLessThanOrEqual(34);
    }
  });

  test('hold steady through a day and change across days', () => {
    const gym = habit({ streak: 23 });
    const notes = new Set(
      ['2026-09-28', '2026-09-29', '2026-09-30'].map(
        (day) =>
          pickTodayMoment({
            habits: [gym],
            goals: [],
            today: day,
            now: endOfDay(day) - 16 * HOUR,
            accountableFrom: null,
            frozenUntil: null,
          })?.note,
      ),
    );
    expect(notes.size).toBe(3);
    expect(pick({ habits: [gym], now: MORNING + HOUR })?.note).toBe(pick({ habits: [gym] })?.note);
  });

  test('stay out of a goals-only glance', () => {
    expect(pick({ goals: [goal({ stakeCents: 2500 })] })?.note).toBeNull();
  });
});

describe('caption emphasis', () => {
  test('bolds the names, days and money that make the case', () => {
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    const dayBack = pick({ habits: [habit({})], goals: [run], accountableFrom: '2026-09-30' });
    expect(dayBack?.emphasis[0]).toBe('Run a 5K');
    const last = pick({ habits: [habit({ title: 'Gym', streak: 23 })], now: MIDNIGHT - HOUR });
    expect(last?.emphasis).toEqual(['Gym', '23-day streak', '$10']);
  });

  test('only ever names terms the caption contains', () => {
    const run = goal({ title: 'Run a 5K', stakeCents: 2500 });
    const moments = [
      pick({ habits: [habit({ title: 'Gym', streak: 23 })], goals: [run] }),
      pick({ habits: [habit({ title: 'Walk' })] }),
      pick({ habits: [habit({ title: 'Walk', stakeView: null })] }),
      pick({ habits: [habit({ title: 'Walk' })], frozenUntil: MIDNIGHT + DAY }),
      pick({ habits: [habit({ title: 'Gym', streak: 23 })], now: MIDNIGHT - HOUR }),
      pick({
        habits: [habit({ streak: 23 })],
        goals: [goal({ stakeCents: 2500, dueAt: MORNING + HOUR })],
      }),
      pick({ habits: [habit({ streak: 12, verification: { status: 'rejected' } })] }),
      pick({ habits: [habit({ completedToday: true, streak: 4 })], goals: [run] }),
      pick({ goals: [goal({ dueAt: MORNING + 4 * DAY })] }),
      pick({ habits: [habit({ startDay: TUESDAY })] }),
    ];
    for (const moment of moments) {
      for (const term of moment?.emphasis ?? []) expect(moment?.sentence).toContain(term);
    }
  });
});

describe('splitEmphasis', () => {
  test('cuts a sentence into plain and bold runs', () => {
    expect(splitEmphasis('on Run a 5K, due Friday.', ['Run a 5K', 'Friday'])).toEqual([
      { text: 'on ', bold: false },
      { text: 'Run a 5K', bold: true },
      { text: ', due ', bold: false },
      { text: 'Friday', bold: true },
      { text: '.', bold: false },
    ]);
  });

  test('ignores terms that are missing, and bolds each only once', () => {
    expect(splitEmphasis('day 2 is day 2.', ['day 2', 'nope'])).toEqual([
      { text: 'day 2', bold: true },
      { text: ' is day 2.', bold: false },
    ]);
    expect(splitEmphasis('plain', [])).toEqual([{ text: 'plain', bold: false }]);
  });
});
