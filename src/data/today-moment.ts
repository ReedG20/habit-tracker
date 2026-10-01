import { isMissed, type GoalWithStatus } from '@/data/goals';
import {
  currentStreak,
  formatStreak,
  isDaily,
  isDoneForToday,
  isWeekDone,
  mustLogToday,
  type HabitWithProgress,
  type Streak,
} from '@/data/habits';
import { skipConsequence, stakeCost } from '@/data/stakes';
import { DAY_ENDS_AT_HOUR, daysBetween, nextDay } from '@/convex/lib/days';
import { targetPerWeek } from '@/convex/lib/frequency';
import { firstJudgedWeek, habitWeekEnd, habitWeekStart } from '@/convex/lib/habitWeek';
import { dayKeyAt, endOfDay, formatShortDate, fromDayKey } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/**
 * The Today hero picks one moment from where the user stands right now: the
 * single fact most likely to change a mind that opened the app hoping to skip.
 * Pure, so every branch is unit-tested; `TodayHero` only renders what it says.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Inside this window before the day ends, the clock itself becomes the
 * headline: from 9 PM, three hours before midnight, though the day runs on to 3 AM.
 */
export const LAST_CALL_MS = (3 + DAY_ENDS_AT_HOUR) * HOUR;
/** Inside this window a goal's deadline beats everything but a retake. */
export const GOAL_CRUNCH_MS = 3 * HOUR;
/** A shorter run is not worth leading with; the stake lands harder. */
const STREAK_WORTH_LEADING = 3;
const MILESTONES = [7, 14, 30, 50, 100, 365];
/** How close a milestone has to be to get a mention. */
const MILESTONE_WINDOW = 7;
const MAX_ALSO = 4;

export type MomentFigure =
  | { kind: 'money'; amount: number; currency?: string; text: string }
  | { kind: 'streak'; streak: Streak }
  /** A clock or a day count; it ticks with `now` rather than counting up. */
  | { kind: 'time'; text: string }
  /** A weekly habit's logs against its target: "1 of 4". */
  | { kind: 'tally'; text: string };

export type MomentKind =
  'retake' | 'goalCrunch' | 'frozen' | 'lastCall' | 'goalToday' | 'streak' | 'stakes' | 'clear';

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
  /** `lockouts.accountableFrom`: days before it are free. */
  accountableFrom: string | null;
  /** When a lockout's freeze lifts, while every habit is frozen; else `null`. */
  frozenUntil: number | null;
};

/**
 * The margin notes (Mansalva, see docs/design.md): lowercase, dry, and short
 * enough for one line in the hero (about 34 characters).
 * A moment with several gets a different one each day, never mid-session.
 */
export const MARGIN_NOTES = {
  retake: ['happens. try another angle.', 'one more photo and it counts.'],
  retry: ['happens. go again.', 'one more go and it counts.'],
  goalCrunch: ['proof first. relax after.'],
  lastCall: ['still time. go.', 'it’s cheaper to just do it.'],
  goalToday: ['get it in early. sleep better.'],
  streak: [
    'don’t hand it back.',
    'you’ve had harder days than this.',
    'moods don’t count. days do.',
  ],
  stakes: ['it’s cheaper to just do it.', 'showing up is the cheap option.'],
  frozen: ['rest up. it all counts again soon.', 'the lock is the point.'],
  done: ['that’s the trick. again tomorrow.', 'nice. same time tomorrow.'],
  week: ['plenty of week left. use it.', 'early logs make the last day easy.'],
  practiceWeek: ['free week. build the habit anyway.'],
  dayBack: ['free day. it all counts tomorrow.'],
  firstDay: ['first day’s free. use it anyway.'],
} satisfies Record<string, string[]>;

/** A rejected attempt, in the words of how it was made. */
const RETRY_COPY: Record<
  'photo' | 'location' | 'timer',
  { kicker: string; sentence: string; note: keyof typeof MARGIN_NOTES }
> = {
  photo: { kicker: 'photo didn’t pass', sentence: 'to retake it', note: 'retake' },
  location: { kicker: 'check-in didn’t pass', sentence: 'to check in', note: 'retry' },
  timer: { kicker: 'timer stopped early', sentence: 'to run it again', note: 'retry' },
};

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
  const day = dayKeyAt(dueAt);
  if (day === today) return `at ${timeFormat.format(new Date(dueAt))}`;
  if (day === nextDay(today)) return 'tomorrow';
  if (dueAt - now < 6 * DAY) return weekdayFormat.format(new Date(dueAt));
  return formatShortDate(dueAt);
}

/**
 * Whether missing `habit` today can lock anything, mirroring `findMisses` in
 * `convex/lib/lockout.ts`: a daily habit's first day is free, as is every day
 * before `accountableFrom` (the day back from a lock); a weekly habit counts
 * from its first week (`firstJudgedWeek`), which is usually the one it was made in.
 */
function countsToday(
  habit: HabitWithProgress,
  today: string,
  accountableFrom: string | null,
): boolean {
  if (!isDaily(habit)) {
    if (accountableFrom === null) return habit.startDay === undefined || today >= habit.startDay;
    return habitWeekStart(habit, today) >= firstJudgedWeek(habit, accountableFrom);
  }
  const afterStart = habit.startDay === undefined ? null : nextDay(habit.startDay);
  const first =
    afterStart === null
      ? accountableFrom
      : accountableFrom === null || afterStart > accountableFrom
        ? afterStart
        : accountableFrom;
  return first === null || today >= first;
}

/**
 * Still owed today. A failed check is excused by the server; a broken habit
 * isn't judged until it's restarted.
 */
function isOwed(habit: HabitWithProgress, today: string, accountableFrom: string | null): boolean {
  if (habit.brokenAt !== undefined) return false;
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
  const cost = stakeCost(goal.stakeView);
  return cost.kind === 'money' ? cost.cents : null;
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

/** "Skip one and $25 is charged". */
function skipLine(owed: HabitWithProgress[]): string {
  return `Skip ${owed.length === 1 ? 'it' : 'one'} and ${skipConsequence(owed).phrase}`;
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
  accountableFrom,
  frozenUntil,
}: TodayMomentInput): TodayMoment | null {
  const openGoals = goals.filter((goal) => isOpen(goal, now));
  const pendingGoals = goals.filter(
    (goal) =>
      goal.completedAt === undefined &&
      !isMissed(goal, now) &&
      goal.submission?.status === 'pending',
  );
  if (habits.length === 0 && openGoals.length === 0 && pendingGoals.length === 0) return null;

  const dayEnd = endOfDay(today);
  const leftToday = dayEnd - now;
  const clock = formatHoursMinutes(leftToday);
  // Frozen, nothing can be logged or missed: no habit is owed.
  const owed =
    frozenUntil === null ? habits.filter((habit) => isOwed(habit, today, accountableFrom)) : [];
  const risk = streakAtRisk(owed);
  const milestone = nextMilestone(risk.streak);
  const slack = weeklySlack(habits, today);

  // The "also" line: every stake the headline left out, most pressing first.
  type Skip = { cost?: boolean; clock?: boolean; streak?: boolean; goal?: GoalWithStatus };
  const broken = habits.filter((habit) => habit.brokenAt !== undefined);
  const also = (skip: Skip = {}) => {
    const lines: string[] = [];
    const goal = openGoals.find((candidate) => candidate !== skip.goal);
    if (owed.length > 0 && !skip.cost) lines.push(skipLine(owed));
    if (owed.length > 0 && !skip.clock) lines.push(`${clock} left today`);
    if (risk.habit !== undefined && risk.streak.count >= STREAK_WORTH_LEADING && !skip.streak) {
      lines.push(`${risk.habit.title}: ${formatStreak(risk.streak)} in a row`);
    }
    if (milestone !== null) lines.push(milestone);
    if (goal !== undefined) lines.push(describeGoal(goal, now, today));
    lines.push(...slack);
    lines.push(...broken.map((habit) => `${habit.title}: streak lost. Restart it`));
    return lines.slice(0, MAX_ALSO);
  };

  // 1. Proof came back rejected: the day is still winnable, and says so.
  const setback = owed.find((habit) => habit.verification?.status === 'rejected');
  if (setback !== undefined) {
    const retry = RETRY_COPY[setback.verification?.method ?? 'photo'];
    const run =
      setback.streak > 0
        ? `${streakAdjective({ count: setback.streak, unit: isDaily(setback) ? 'day' : 'week' })} streak`
        : null;
    const alive = run === null ? '' : ` Your ${run}’s still alive.`;
    return {
      kind: 'retake',
      tone: 'urgent',
      kicker: `Your ${setback.title} ${retry.kicker}`,
      figure: { kind: 'time', text: clock },
      sentence: `${retry.sentence} before 3\u00a0AM.${alive}`,
      emphasis: run === null ? ['before 3\u00a0AM'] : ['before 3\u00a0AM', run],
      also: also({ clock: true, streak: true }),
      note: pickNote(retry.note, today),
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

  // 3. Frozen by a lockout: nothing to log, so say when it's over.
  if (frozenUntil !== null && habits.length > 0) {
    const back = weekdayFormat.format(new Date(frozenUntil + HOUR));
    return {
      kind: 'frozen',
      tone: 'normal',
      kicker: 'Your habits are frozen',
      figure: { kind: 'time', text: formatTimeLeft(frozenUntil - now) },
      sentence: `until they’re back on ${back}. Goals still count.`,
      emphasis: [back],
      also: also(),
      note: pickNote('frozen', today),
    };
  }

  // 4. Late with habits still open: the clock is the argument.
  if (owed.length > 0 && leftToday <= LAST_CALL_MS) {
    const cost = skipConsequence(owed);
    // Only the habit that owns the run can end it, so only name it when it's the one.
    const one = owed.length === 1;
    const run = one && risk.habit !== undefined ? `${streakAdjective(risk.streak)} streak` : null;
    const outcome =
      cost.kind === 'none'
        ? run === null
          ? 'the streak starts over'
          : `your ${run} ends`
        : run === null
          ? cost.phrase
          : `your ${run} ends, and ${cost.phrase}`;
    const money = cost.cents > 0 ? [formatCents(cost.cents)] : [];
    return {
      kind: 'lastCall',
      tone: 'urgent',
      kicker: `${cost.short} at 3\u00a0AM`,
      figure: { kind: 'time', text: clock },
      sentence: one
        ? `${owed[0].title}’s still open. Skip it and ${outcome}.`
        : `${owed.length} habits are still open. Skip one and ${cost.phrase}.`,
      emphasis: [...(one ? [owed[0].title] : []), ...(run === null ? [] : [run]), ...money],
      also: also({ cost: true, clock: true, streak: one }),
      note: pickNote('lastCall', today),
    };
  }

  // 5. A staked goal settles before tonight's habits do.
  const dueToday = openGoals.find((goal) => goal.dueAt < dayEnd && stakeCents(goal) !== null);
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

  // 6. A run worth protecting: lead with what a skip would end.
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

  // 7. Early days: the stake is what bites.
  if (owed.length > 0) {
    const cost = skipConsequence(owed);
    const them = owed.length === 1 ? 'it' : 'them';
    const day = risk.streak.unit === 'day' ? risk.streak.count + 1 : null;
    const upside =
      day === null
        ? `Log ${them} and keep the week on track.`
        : day === 1
          ? `Log ${them} and day 1 is on the board.`
          : `Log ${them} and day ${day} is yours.`;
    const what = owed.length === 1 ? `${owed[0].title} today` : skipping(owed);
    return cost.cents > 0
      ? {
          kind: 'stakes',
          tone: 'normal',
          kicker: `Skip ${what} and it costs`,
          figure: { kind: 'money', amount: cost.cents / 100, text: formatCents(cost.cents) },
          sentence: `charged the moment the streak breaks. ${upside}`,
          emphasis: day === null ? [] : [`day ${day}`],
          also: also({ cost: true }),
          note: pickNote('stakes', today),
        }
      : {
          kind: 'stakes',
          tone: 'normal',
          kicker: `Skip ${skipping(owed)} and ${cost.phrase}`,
          figure: { kind: 'time', text: clock },
          sentence: `left today. ${upside}`,
          emphasis: day === null ? [] : [`day ${day}`],
          also: also({ cost: true, clock: true }),
          note: pickNote('stakes', today),
        };
  }

  // 8. Nothing owed: bank the win and point at what's next.
  const headline = currentStreak(habits);
  const nextGoal = openGoals[0];
  const pending = habits.some(isPending) || pendingGoals.length > 0;
  // Unlogged but owing nothing: made today, or excused by a failed check.
  const unlogged = habits.filter(
    (habit) =>
      habit.brokenAt === undefined &&
      !isDoneForToday(habit) &&
      !isPending(habit) &&
      (isDaily(habit) || mustLogToday(habit, today)),
  );
  const startingTomorrow = unlogged.filter((habit) => !countsToday(habit, today, accountableFrom));

  const dayBack = accountableFrom !== null && today < accountableFrom && unlogged.length > 0;
  // No run and no goal to show, but a weekly habit with logs still to fit in:
  // its tally is the number, the one with the most left to do.
  const tallied =
    headline.count > 0 ||
    nextGoal !== undefined ||
    pending ||
    dayBack ||
    startingTomorrow.length > 0
      ? undefined
      : habits
          .filter((habit) => habit.brokenAt === undefined && !isDaily(habit) && !isWeekDone(habit))
          .sort((a, b) => targetPerWeek(b) - b.weekCount - (targetPerWeek(a) - a.weekCount))[0];
  // A weekly habit whose week began before the user's day back from a lock
  // only counts from its next week.
  const practiceWeek = tallied !== undefined && !countsToday(tallied, today, accountableFrom);

  const figure: MomentFigure | null =
    headline.count > 0
      ? { kind: 'streak', streak: headline }
      : nextGoal !== undefined
        ? (goalMoney(nextGoal) ?? { kind: 'time', text: formatTimeLeft(nextGoal.dueAt - now) })
        : tallied !== undefined
          ? { kind: 'tally', text: `${tallied.weekCount} of ${targetPerWeek(tallied)}` }
          : null;

  // With nothing owed the kicker names what the figure is; the note says why.
  // "Today's done" needs something actually done today when the figure is a
  // week still to fill: otherwise it's just a day nothing was due.
  const doneToday = figure?.kind !== 'tally' || habits.some((habit) => habit.completedToday);
  const kicker = pending
    ? 'Proof’s in review'
    : unlogged.length === 0 && habits.length > 0 && doneToday
      ? 'Today’s done'
      : figure?.kind === 'streak'
        ? 'Your streak'
        : figure?.kind === 'tally'
          ? 'This week'
          : figure !== null
            ? 'Next up'
            : 'Nothing on the line today';

  const note =
    kicker === 'Today’s done'
      ? pickNote('done', today)
      : pending
        ? null
        : dayBack
          ? pickNote('dayBack', today)
          : startingTomorrow.length > 0
            ? pickNote('firstDay', today)
            : figure?.kind === 'tally'
              ? pickNote(practiceWeek ? 'practiceWeek' : 'week', today)
              : null;

  // The caption says what the figure is; whatever it leaves out rides in the capsule.
  const goalInFigure = figure?.kind === 'money' || figure?.kind === 'time' ? nextGoal : undefined;
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
  } else if (tallied !== undefined) {
    const left = targetPerWeek(tallied) - tallied.weekCount;
    const days = daysBetween(today, habitWeekEnd(tallied, today)).length;
    const window = `${days} ${days === 1 ? 'day' : 'days'}`;
    if (practiceWeek) {
      const from = weekdayFormat.format(fromDayKey(nextDay(habitWeekEnd(tallied, today))));
      sentence = `${tallied.title} this week. It counts from ${from}, so this one’s practice.`;
      emphasis = [tallied.title, from];
    } else {
      sentence = `${tallied.title} this week, with ${window} left to fit in ${left} more.`;
      emphasis = [tallied.title, window];
    }
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
    ...slack.filter(
      (line) => `${line}.` !== sentence && !(tallied && line.startsWith(`${tallied.title}:`)),
    ),
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
