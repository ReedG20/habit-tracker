import { isMissed, type GoalWithStatus } from '@/data/goals';
import {
  currentStreak,
  formatStreak,
  isDaily,
  isDoneForToday,
  mustLogToday,
  type HabitWithProgress,
  type Streak,
} from '@/data/habits';
import { dayOfWeek, nextDay, weekEnd } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import { endOfDay, formatShortDate, fromDayKey, toDayKey } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/**
 * The Today hero picks one moment from where the user stands right now: the
 * single fact most likely to change a mind that opened the app hoping to skip.
 * Pure, so every branch is unit-tested; `TodayHero` only renders what it says.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Inside this window before midnight, the clock itself becomes the headline. */
export const LAST_CALL_MS = 3 * HOUR;
/** Inside this window a goal's deadline beats everything but a retake. */
export const GOAL_CRUNCH_MS = 3 * HOUR;
/** A shorter run is not worth leading with; the fee lands harder. */
const STREAK_WORTH_LEADING = 3;
const MILESTONES = [7, 14, 30, 50, 100, 365];
/** How close a milestone has to be to get a mention. */
const MILESTONE_WINDOW = 7;
const MAX_ALSO = 4;

/** The re-entry fee as the store sells it. */
export type Fee = {
  /** In major units (`9.99`), for counting up. */
  amount: number;
  /** ISO code, so the count-up formats like the store does. */
  currency: string;
  /** The store's own string (`$9.99`), which the count-up lands on. */
  text: string;
};

export type MomentFigure =
  | { kind: 'money'; amount: number; currency?: string; text: string }
  | { kind: 'streak'; streak: Streak }
  /** A clock or a day count; it ticks with `now` rather than counting up. */
  | { kind: 'time'; text: string };

export type MomentKind =
  'retake' | 'goalCrunch' | 'lastCall' | 'goalToday' | 'streak' | 'fee' | 'clear';

export type TodayMoment = {
  kind: MomentKind;
  tone: 'urgent' | 'normal' | 'done';
  kicker: string;
  /** `null` only when there is no number worth showing (no run, nothing staked). */
  figure: MomentFigure | null;
  sentence: string;
  /** The key terms in `sentence` (names, days, money), which the hero sets in bold. */
  emphasis: string[];
  /** A handwritten aside from the coach in the margin; only some moments get one. */
  note: string | null;
  /** The stakes the headline left out, for the rotating line under it. */
  also: string[];
};

export type TodayMomentInput = {
  habits: HabitWithProgress[];
  goals: GoalWithStatus[];
  today: string;
  now: number;
  /** `null` when the store has no price to give (web, or the product is not live). */
  fee: Fee | null;
  /** `lockouts.accountableFrom`: days before it are free. */
  accountableFrom: string | null;
};

/**
 * The margin notes (Mansalva, see docs/design.md): lowercase, dry, and short
 * enough for one line in the hero (about 34 characters).
 * A moment with several gets a different one each day, never mid-session.
 */
export const MARGIN_NOTES = {
  retake: ['happens. try another angle.', 'one more photo and it counts.'],
  goalCrunch: ['proof first. relax after.'],
  lastCall: ['still time. go.', 'it’s cheaper to just do it.'],
  goalToday: ['get it in early. sleep better.'],
  streak: [
    'don’t hand it back.',
    'you’ve had harder days than this.',
    'moods don’t count. days do.',
  ],
  fee: ['it’s cheaper to just do it.', 'the lock is the point.', 'showing up is the cheap option.'],
  done: ['that’s the trick. again tomorrow.', 'nice. same time tomorrow.'],
  dayBack: ['free day. it all counts tomorrow.'],
  firstDay: ['first day’s free. use it anyway.'],
} satisfies Record<string, string[]>;

function pickNote(key: keyof typeof MARGIN_NOTES, today: string): string {
  const notes = MARGIN_NOTES[key];
  const dayNumber = Math.round(fromDayKey(today).getTime() / DAY);
  return notes[dayNumber % notes.length];
}

/** "1h 20m", "45m", "3h": time left, rounded up so it never reads 0 while time remains. */
export function formatHoursMinutes(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / MINUTE));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "1h 20m" inside a day, "6 days" beyond it. */
function formatTimeLeft(ms: number): string {
  if (ms < DAY) return formatHoursMinutes(ms);
  const days = Math.floor(ms / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/** "at 6:00 PM", "tomorrow", "Friday", "Oct 3": when a goal is due, as it reads after "due". */
function describeDue(dueAt: number, now: number, today: string): string {
  const day = toDayKey(new Date(dueAt));
  if (day === today) return `at ${timeFormat.format(new Date(dueAt))}`;
  if (day === nextDay(today)) return 'tomorrow';
  if (dueAt - now < 6 * DAY) return weekdayFormat.format(new Date(dueAt));
  return formatShortDate(dueAt);
}

/**
 * Whether missing `habit` today can lock anything, mirroring `firstCountedDay`
 * in `convex/lib/lockout.ts`: the day a habit is made is free, as is every day
 * before `accountableFrom` (the day back from a lock), and a weekly habit only
 * counts from its first whole week.
 */
function countsToday(
  habit: HabitWithProgress,
  today: string,
  accountableFrom: string | null,
): boolean {
  const afterStart = habit.startDay === undefined ? null : nextDay(habit.startDay);
  const first =
    afterStart === null
      ? accountableFrom
      : accountableFrom === null || afterStart > accountableFrom
        ? afterStart
        : accountableFrom;
  if (first === null) return true;
  if (isDaily(habit)) return today >= first;
  const firstWeek = dayOfWeek(first) === 0 ? first : nextDay(weekEnd(first));
  return today >= firstWeek;
}

/** Still owed today with something riding on it. A failed check is excused by the server. */
function isOwed(habit: HabitWithProgress, today: string, accountableFrom: string | null): boolean {
  if (isDoneForToday(habit) || !countsToday(habit, today, accountableFrom)) return false;
  const status = habit.verification?.status;
  if (status === 'pending' || status === 'failed') return false;
  return isDaily(habit) || mustLogToday(habit, today) || status === 'rejected';
}

function isPending(habit: HabitWithProgress): boolean {
  return !isDoneForToday(habit) && habit.verification?.status === 'pending';
}

function isOpen(goal: GoalWithStatus, now: number): boolean {
  return (
    goal.completedAt === undefined && !isMissed(goal, now) && goal.submission?.status !== 'pending'
  );
}

function stakeCents(goal: GoalWithStatus): number | null {
  return goal.stake?.status === 'armed' ? goal.stake.amountCents : null;
}

function goalMoney(goal: GoalWithStatus): MomentFigure | null {
  const cents = stakeCents(goal);
  return cents === null ? null : { kind: 'money', amount: cents / 100, text: formatCents(cents) };
}

/** "23-day", "5-week": a streak as it reads before a noun. */
function streakAdjective({ count, unit }: Streak): string {
  return `${count}-${unit}`;
}

/** The run a skip would actually end: the longest among owed habits, not the headline. */
function streakAtRisk(owed: HabitWithProgress[]): { streak: Streak; habit?: HabitWithProgress } {
  const streak = currentStreak(owed);
  const habit = owed.find(
    (candidate) =>
      candidate.streak === streak.count && isDaily(candidate) === (streak.unit === 'day'),
  );
  return { streak, habit: streak.count > 0 ? habit : undefined };
}

function nextMilestone({ count, unit }: Streak): string | null {
  if (unit !== 'day' || count < STREAK_WORTH_LEADING) return null;
  const milestone = MILESTONES.find((candidate) => candidate > count);
  if (milestone === undefined || milestone - count > MILESTONE_WINDOW) return null;
  const left = milestone - count;
  return `${left} ${left === 1 ? 'day' : 'days'} to a ${milestone}-day streak`;
}

function weeklySlack(habits: HabitWithProgress[], today: string): string[] {
  return habits
    .filter((habit) => !isDaily(habit) && !isDoneForToday(habit) && !mustLogToday(habit, today))
    .map((habit) => `${habit.title}: ${targetPerWeek(habit) - habit.weekCount} more this week`);
}

function describeGoal(goal: GoalWithStatus, now: number, today: string): string {
  const cents = stakeCents(goal);
  const due = describeDue(goal.dueAt, now, today);
  return cents === null
    ? `${goal.title}: due ${due}`
    : `${goal.title}: ${formatCents(cents)} on it, due ${due}`;
}

function feeLine(fee: Fee | null): string {
  return fee === null ? 'Skip a habit and Ante locks' : `${fee.text} to get back in if you skip`;
}

/** What a skip would be of: "Gym", or "any of today's 2 habits". */
function skipping(owed: HabitWithProgress[]): string {
  return owed.length === 1 ? owed[0].title : `any of today’s ${owed.length} habits`;
}

/** "Gym" for one habit, "2 habits" for more. */
function naming(owed: HabitWithProgress[]): string {
  return owed.length === 1 ? owed[0].title : `${owed.length} habits`;
}

export function pickTodayMoment({
  habits,
  goals,
  today,
  now,
  fee,
  accountableFrom,
}: TodayMomentInput): TodayMoment | null {
  const openGoals = goals.filter((goal) => isOpen(goal, now));
  const pendingGoals = goals.filter(
    (goal) =>
      goal.completedAt === undefined &&
      !isMissed(goal, now) &&
      goal.submission?.status === 'pending',
  );
  if (habits.length === 0 && openGoals.length === 0 && pendingGoals.length === 0) return null;

  const midnight = endOfDay(today);
  const leftToday = midnight - now;
  const clock = formatHoursMinutes(leftToday);
  const owed = habits.filter((habit) => isOwed(habit, today, accountableFrom));
  const risk = streakAtRisk(owed);
  const milestone = nextMilestone(risk.streak);
  const slack = weeklySlack(habits, today);

  // The "also" line: every stake the headline left out, most pressing first.
  type Skip = { fee?: boolean; clock?: boolean; streak?: boolean; goal?: GoalWithStatus };
  const also = (skip: Skip = {}) => {
    const lines: string[] = [];
    const goal = openGoals.find((candidate) => candidate !== skip.goal);
    if (owed.length > 0 && !skip.fee) lines.push(feeLine(fee));
    if (owed.length > 0 && !skip.clock) lines.push(`${clock} left today`);
    if (risk.habit !== undefined && risk.streak.count >= STREAK_WORTH_LEADING && !skip.streak) {
      lines.push(`${risk.habit.title}: ${formatStreak(risk.streak)} in a row`);
    }
    if (milestone !== null) lines.push(milestone);
    if (goal !== undefined) lines.push(describeGoal(goal, now, today));
    lines.push(...slack);
    return lines.slice(0, MAX_ALSO);
  };

  // 1. A photo came back rejected: the day is still winnable, and says so.
  const setback = owed.find((habit) => habit.verification?.status === 'rejected');
  if (setback !== undefined) {
    const run =
      setback.streak > 0
        ? `${streakAdjective({ count: setback.streak, unit: isDaily(setback) ? 'day' : 'week' })} streak`
        : null;
    const alive = run === null ? '' : ` Your ${run}’s still alive.`;
    return {
      kind: 'retake',
      tone: 'urgent',
      kicker: `Your ${setback.title} photo didn’t pass`,
      figure: { kind: 'time', text: clock },
      sentence: `to retake it before midnight.${alive}`,
      emphasis: run === null ? ['before midnight'] : ['before midnight', run],
      also: also({ clock: true, streak: true }),
      note: pickNote('retake', today),
    };
  }

  // 2. A goal about to settle is real money, sooner than any habit.
  const crunch = openGoals.find((goal) => goal.dueAt - now <= GOAL_CRUNCH_MS);
  if (crunch !== undefined) {
    const money = goalMoney(crunch);
    const due = describeDue(crunch.dueAt, now, today);
    const by = timeFormat.format(new Date(crunch.dueAt));
    const rest = also({ goal: crunch });
    return money === null
      ? {
          kind: 'goalCrunch',
          tone: 'urgent',
          kicker: `${crunch.title} is due ${due}`,
          figure: { kind: 'time', text: formatHoursMinutes(crunch.dueAt - now) },
          sentence: 'left to send your proof.',
          emphasis: [],
          also: rest,
          note: pickNote('goalCrunch', today),
        }
      : {
          kind: 'goalCrunch',
          tone: 'urgent',
          kicker: `Due in ${formatHoursMinutes(crunch.dueAt - now)}`,
          figure: money,
          sentence: `riding on ${crunch.title}. No proof by ${by}, and it’s charged.`,
          emphasis: [crunch.title, by],
          also: rest,
          note: pickNote('goalCrunch', today),
        };
  }

  // 3. Late with habits still open: the clock is the argument.
  if (owed.length > 0 && leftToday <= LAST_CALL_MS) {
    const pay = fee === null ? 'you pay to get back in' : `it’s ${fee.text} to get back in`;
    // Only the habit that owns the run can end it, so only name it when it's the one.
    const one = owed.length === 1;
    const run = one && risk.habit !== undefined ? `${streakAdjective(risk.streak)} streak` : null;
    const lose = run === null ? '' : `your ${run} ends, and `;
    return {
      kind: 'lastCall',
      tone: 'urgent',
      kicker: 'Ante locks at midnight',
      figure: { kind: 'time', text: clock },
      sentence: one
        ? `${owed[0].title}’s still open. Skip it and ${lose}${pay}.`
        : `${owed.length} habits are still open. Skip one and ${pay}.`,
      emphasis: [
        ...(one ? [owed[0].title] : []),
        ...(run === null ? [] : [run]),
        ...(fee === null ? [] : [fee.text]),
      ],
      also: also({ fee: true, clock: true, streak: one }),
      note: pickNote('lastCall', today),
    };
  }

  // 4. A staked goal settles before tonight's habits do.
  const dueToday = openGoals.find((goal) => goal.dueAt < midnight && stakeCents(goal) !== null);
  if (dueToday !== undefined) {
    return {
      kind: 'goalToday',
      tone: 'urgent',
      kicker: `Due ${describeDue(dueToday.dueAt, now, today)}`,
      figure: goalMoney(dueToday),
      sentence: `riding on ${dueToday.title}. Proof by then, or it’s charged.`,
      emphasis: [dueToday.title],
      also: also({ goal: dueToday }),
      note: pickNote('goalToday', today),
    };
  }

  // 5. A run worth protecting: lead with what a skip would end.
  if (risk.habit !== undefined && risk.streak.count >= STREAK_WORTH_LEADING) {
    const { streak, habit } = risk;
    const next =
      streak.unit === 'day'
        ? `Log ${habit.title} today to make it day ${streak.count + 1}.`
        : `${habit.title} needs today to keep the run going.`;
    const others = owed.length - 1;
    return {
      kind: 'streak',
      tone: 'normal',
      kicker: 'Streak on the line',
      figure: { kind: 'streak', streak },
      sentence:
        others === 0
          ? next
          : `${next} ${others === 1 ? 'One more habit' : `${others} more habits`} after that.`,
      emphasis: streak.unit === 'day' ? [habit.title, `day ${streak.count + 1}`] : [habit.title],
      also: also({ streak: true }),
      note: pickNote('streak', today),
    };
  }

  // 6. Early days: the fee is the stake that bites.
  if (owed.length > 0) {
    const them = owed.length === 1 ? 'it' : 'them';
    const day = risk.streak.unit === 'day' ? risk.streak.count + 1 : null;
    const upside =
      day === null
        ? `Log ${them} and keep the week on track.`
        : day === 1
          ? `Log ${them} and day 1 is on the board.`
          : `Log ${them} and day ${day} is yours.`;
    return fee === null
      ? {
          kind: 'fee',
          tone: 'normal',
          kicker: `Skip ${skipping(owed)} and Ante locks`,
          figure: { kind: 'time', text: clock },
          sentence: `left today. ${upside}`,
          emphasis: day === null ? [] : [`day ${day}`],
          also: also({ fee: true, clock: true }),
          note: pickNote('fee', today),
        }
      : {
          kind: 'fee',
          tone: 'normal',
          kicker: `Skip ${owed.length === 1 ? `${owed[0].title} today` : skipping(owed)} and it costs`,
          figure: { kind: 'money', amount: fee.amount, currency: fee.currency, text: fee.text },
          sentence: `to get back in. ${upside}`,
          emphasis: day === null ? [] : [`day ${day}`],
          also: also({ fee: true }),
          note: pickNote('fee', today),
        };
  }

  // 7. Nothing owed: bank the win and point at what's next.
  const headline = currentStreak(habits);
  const nextGoal = openGoals[0];
  const pending = habits.some(isPending) || pendingGoals.length > 0;
  // Unlogged but owing nothing: made today, or excused by a failed check.
  const unlogged = habits.filter(
    (habit) =>
      !isDoneForToday(habit) && !isPending(habit) && (isDaily(habit) || mustLogToday(habit, today)),
  );
  const startingTomorrow = unlogged.filter((habit) => !countsToday(habit, today, accountableFrom));

  const figure: MomentFigure | null =
    headline.count > 0
      ? { kind: 'streak', streak: headline }
      : nextGoal === undefined
        ? null
        : (goalMoney(nextGoal) ?? { kind: 'time', text: formatTimeLeft(nextGoal.dueAt - now) });

  // With nothing owed the kicker names what the figure is; the note says why.
  const kicker = pending
    ? 'Proof’s in review'
    : unlogged.length === 0 && habits.length > 0
      ? 'Today’s done'
      : figure?.kind === 'streak'
        ? 'Your streak'
        : figure !== null
          ? 'Next up'
          : 'Nothing on the line today';

  const dayBack = accountableFrom !== null && today < accountableFrom && unlogged.length > 0;
  const note =
    kicker === 'Today’s done'
      ? pickNote('done', today)
      : pending
        ? null
        : dayBack
          ? pickNote('dayBack', today)
          : startingTomorrow.length > 0
            ? pickNote('firstDay', today)
            : null;

  // The caption says what the figure is; whatever it leaves out rides in the capsule.
  const goalInFigure = figure !== null && figure.kind !== 'streak' ? nextGoal : undefined;
  let sentence: string;
  let emphasis: string[] = [];
  if (figure?.kind === 'streak') {
    const tail = pending
      ? ' Today’s is in review.'
      : unlogged.length > 0
        ? ' Today doesn’t count against it.'
        : kicker === 'Today’s done'
          ? ' Today’s in the bank.'
          : '';
    sentence = `in a row.${tail}`;
  } else if (goalInFigure !== undefined && figure?.kind === 'money') {
    const due = describeDue(goalInFigure.dueAt, now, today);
    sentence = `on ${goalInFigure.title}, due ${due}.`;
    emphasis = [goalInFigure.title, due];
  } else if (goalInFigure !== undefined) {
    sentence = `until ${goalInFigure.title} is due.`;
    emphasis = [goalInFigure.title];
  } else if (pending) {
    sentence = 'You’ll hear back as soon as it’s checked.';
  } else if (dayBack) {
    sentence = 'Your day back is free. Everything counts again tomorrow.';
    emphasis = ['free'];
  } else if (startingTomorrow.length > 0) {
    const one = startingTomorrow.length === 1;
    sentence = `${naming(startingTomorrow)} ${one ? 'starts' : 'start'} counting tomorrow.`;
    emphasis = [naming(startingTomorrow)];
  } else if (slack.length > 0) {
    sentence = `${slack[0]}.`;
  } else {
    sentence = 'See you tomorrow.';
  }

  const headlineMilestone = nextMilestone(headline);
  const lines = [
    ...(headlineMilestone === null ? [] : [headlineMilestone]),
    ...openGoals
      .filter((goal) => goal !== goalInFigure)
      .slice(0, 2)
      .map((goal) => describeGoal(goal, now, today)),
    ...slack.filter((line) => `${line}.` !== sentence),
  ];

  return {
    kind: 'clear',
    tone: kicker === 'Today’s done' ? 'done' : 'normal',
    kicker,
    figure,
    sentence,
    emphasis,
    note,
    also: lines.slice(0, MAX_ALSO),
  };
}

/**
 * `sentence` cut into plain and bold runs: each term in `emphasis` is bolded
 * where it first appears; terms that aren't in the sentence are ignored.
 */
export function splitEmphasis(
  sentence: string,
  emphasis: string[],
): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = [];
  const left = emphasis.filter((term) => term.length > 0);
  let at = 0;
  while (at < sentence.length) {
    // The next term to start, the longer one when two start together.
    let next: { index: number; term: string } | null = null;
    for (const term of left) {
      const index = sentence.indexOf(term, at);
      if (index === -1) continue;
      if (
        next === null ||
        index < next.index ||
        (index === next.index && term.length > next.term.length)
      ) {
        next = { index, term };
      }
    }
    if (next === null) break;
    if (next.index > at) runs.push({ text: sentence.slice(at, next.index), bold: false });
    runs.push({ text: next.term, bold: true });
    left.splice(left.indexOf(next.term), 1);
    at = next.index + next.term.length;
  }
  if (at < sentence.length) runs.push({ text: sentence.slice(at), bold: false });
  return runs;
}
