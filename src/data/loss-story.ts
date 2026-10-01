import type { Loss } from '@/convex/stakes';
import { dayOfWeek } from '@/convex/lib/days';
import { cardLabel, formatCents } from '@/lib/money';

/**
 * The words on the loss screen, from the stake that came due. Pure, so each
 * case is tested. The screen is meant to land like a loss and leave like a
 * reason: say plainly what happened, then what the stake bought while it
 * held, then the way back in.
 */

/** Below this the run is too short to credit the money with it; say so honestly. */
export const SHORT_RUN = { day: 5, week: 2 } as const;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const monthDay = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dueFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

export type LossStory = {
  kicker: string;
  /**
   * The big line: the amount for money (the screen animates it), with what
   * became of it underneath ("Gone.", "Still owed.", "Refunded."), or a short word.
   */
  headline: { kind: 'money'; cents: number; label: string } | { kind: 'words'; text: string };
  /** Whether the money actually left the card (a decline didn't). */
  gone: boolean;
  line: string;
  /** Terms in `line` set in bold. */
  emphasis: string[];
  /** What the stake bought while it held; habits only. */
  bought: {
    title: string;
    body: string;
    count: number;
    unit: 'day' | 'week';
    short: boolean;
  } | null;
  note: string;
};

/** "on Tuesday", "the week starting Sep 21". */
function missedWhen(period: string | undefined, unit: 'day' | 'week' | undefined): string {
  if (period === undefined) return '';
  const [year, month, day] = period.split('-').map(Number);
  if (unit === 'week')
    return ` the week starting ${monthDay.format(new Date(Date.UTC(year, month - 1, day)))}`;
  return ` on ${WEEKDAYS[dayOfWeek(period)]}`;
}

function plural(count: number, unit: 'day' | 'week'): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function lossStory(loss: Loss): LossStory {
  const { stake, run, title } = loss;
  const unit = run?.unit ?? 'day';
  const streak = run?.streak ?? 0;
  const isHabit = loss.habitId !== undefined;
  const when = isHabit ? missedWhen(run?.missedPeriod, run?.unit) : '';
  const due = loss.dueAt === undefined ? '' : ` by ${dueFormat.format(new Date(loss.dueAt))}`;
  const kicker = isHabit ? 'Streak broken' : 'Deadline missed';
  const ended = streak >= 2 ? `, and your ${streak}-${unit} streak ended` : '';

  if (stake.kind === 'money') {
    const amount = formatCents(stake.amountCents);
    const card = cardLabel(stake);
    const declined = stake.status === 'charge_failed';
    const refunded = stake.status === 'refunded';
    const what = isHabit ? `You missed ${title}${when}${ended}.` : `No proof for ${title}${due}.`;
    return {
      kicker,
      headline: {
        kind: 'money',
        cents: stake.amountCents,
        label: declined ? 'Still owed.' : refunded ? 'Refunded.' : 'Gone.',
      },
      gone: !declined,
      line: declined
        ? `${what} Your card declined, so the ${amount} didn’t go through. You still owe it.`
        : refunded
          ? `${what} The ${amount} charged to ${card} was refunded.`
          : `${what} ${amount} was charged to ${card}.`,
      emphasis: [title, amount],
      // Nothing was kept on a decline or a refund, so the money can't be said to have bought anything.
      bought: isHabit && !declined && !refunded ? bought(stake.amountCents, streak, unit) : null,
      note: declined
        ? 'a bet you don’t pay isn’t a bet.'
        : isHabit
          ? 'the money’s gone. the habit doesn’t have to be.'
          : 'missing once is data. twice is a pattern.',
    };
  }

  if (stake.kind === 'friend') {
    const name = stake.friendName;
    return {
      kicker,
      headline: { kind: 'words', text: `${name} knows.` },
      gone: true,
      line: isHabit
        ? `You missed ${title}${when}${ended}, so we emailed ${name}.`
        : `No proof for ${title}${due}, so we emailed ${name}.`,
      emphasis: [title, name],
      bought: null,
      note: 'get to them before they get to you.',
    };
  }

  const back =
    loss.frozenUntil === undefined
      ? 'for a while'
      : `until ${weekdayFormat.format(new Date(loss.frozenUntil + 60 * 60 * 1000))}`;
  return {
    kicker,
    headline: { kind: 'words', text: 'Frozen.' },
    gone: true,
    line: `You missed ${title}${when}${ended}, so every habit is frozen ${back}. Goals still count.`,
    emphasis: [title, back],
    bought: null,
    note: 'the lock is the point.',
  };
}

/**
 * What the money bought: the run it held up. Honest when the run was short:
 * the money didn't get a chance to work yet, and that's worth saying.
 */
function bought(
  cents: number,
  streak: number,
  unit: 'day' | 'week',
): NonNullable<LossStory['bought']> {
  if (streak < SHORT_RUN[unit]) {
    const which = unit === 'day' ? `day ${streak + 1}` : `week ${streak + 1}`;
    return {
      title: `It broke on ${which}.`,
      body:
        unit === 'day'
          ? 'The money never got the chance to work. Pick an amount you’ll feel, and day one is tomorrow.'
          : 'The money never got the chance to work. Pick an amount you’ll feel, and start the week strong.',
      count: streak,
      unit,
      short: true,
    };
  }
  const per = formatCents(Math.max(1, Math.round(cents / streak)));
  return {
    title: `${formatCents(cents)} bought you ${plural(streak, unit)}.`,
    body: `About ${per} a ${unit}, for a run you might never have had without it. That’s the deal working.`,
    count: streak,
    unit,
    short: false,
  };
}

/** What a friend gets to read in a text from the user, if they'd rather say it first. */
export function textFriendBody(title: string): string {
  return `Heads up, you’re about to get an email from Ante. I missed ${title}. Hold me to it next time?`;
}
