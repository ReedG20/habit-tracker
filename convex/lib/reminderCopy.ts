import { localClock, zonedDay } from './zonedTime';

/**
 * Every word a push says. Shared by the backend, which sends them, and the app,
 * which previews them on the Reminders screen.
 *
 * The voice: short, a little dry, fragments are fine. It can get sharper as the
 * clock runs down, but never after someone has already lost. Times are worked
 * out when the push goes, so the copy always says how long is actually left.
 * Where there are variants, the pick is stable per deadline and day, so the
 * same nudge never flip-flops and tests stay deterministic.
 */

export type PushCopy = { title: string; body: string };

/** What a missed habit costs; absent when it's only the user's word. */
export type HabitStakeLine =
  | { kind: 'money'; cents: number }
  | { kind: 'friend'; name: string }
  | { kind: 'lockout'; days: number }
  /** The retired re-entry fee, for deployments not yet on per-habit stakes. */
  | { kind: 'fee' };

export type HabitLine = {
  title: string;
  /** Set for a weekly habit that has no slack left: logs still needed before its week ends. */
  weeklyNeeded?: number;
  stake?: HabitStakeLine;
};

/**
 * What happens if these habits are missed, as the end of "…, or ___": the
 * money adds up; otherwise the harshest of the rest.
 */
export function missConsequence(stakes: (HabitStakeLine | undefined)[]): string {
  const cents = stakes.reduce((sum, stake) => sum + (stake?.kind === 'money' ? stake.cents : 0), 0);
  if (cents > 0) return `${formatMoney(cents)} is charged`;
  if (stakes.some((stake) => stake?.kind === 'lockout')) return 'your habits freeze';
  const friend = stakes.find((stake) => stake?.kind === 'friend');
  if (friend?.kind === 'friend') return `${friend.name} hears about it`;
  if (stakes.some((stake) => stake?.kind === 'fee')) return 'Ante locks';
  return 'the streak resets';
}

export type GoalLine = {
  title: string;
  /** `null` when nothing is staked: their word is on it. */
  stakeCents: number | null;
};

export type ReminderMessage =
  | {
      kind: 'habits';
      habits: HabitLine[];
      msLeft: number;
      final: boolean;
      seed: string;
      /** Which nudge this is for its deadline, from 0; consecutive ones never share wording. */
      step?: number;
    }
  | {
      kind: 'goals';
      goals: GoalLine[];
      /** "5pm", "tomorrow 5pm", "Fri 5pm". */
      dueLabel: string;
      msLeft: number;
      final: boolean;
      seed: string;
      /** Which nudge this is for its deadline, from 0; consecutive ones never share wording. */
      step?: number;
    }
  | {
      kind: 'lineup';
      habits: string[];
      goals: (GoalLine & { dueLabel: string })[];
    };

export type EventMessage =
  | {
      kind: 'rejected';
      subject: 'habit' | 'goal';
      title: string;
      reason: string;
      /** How the habit is proved; photo when absent. */
      method?: 'photo' | 'location' | 'timer';
      /** Time left to try again, or `null` once the deadline has passed. */
      msLeft: number | null;
    }
  | { kind: 'unchecked'; title: string; msLeft: number | null }
  | { kind: 'approved'; subject: 'habit' | 'goal'; title: string; stakeCents: number | null }
  | {
      kind: 'charged';
      subject: 'habit' | 'goal';
      title: string;
      amountCents: number;
      /** The run it ended, for a habit. */
      streak?: number;
    }
  | { kind: 'declined'; title: string; amountCents: number }
  | { kind: 'friendTold'; title: string; friendName: string }
  | { kind: 'friendGone'; title: string; friendName: string; why: 'opted_out' | 'bounced' }
  | { kind: 'frozen'; title: string; untilLabel: string }
  | { kind: 'thawed' }
  /**
   * Locked, and the subscription is still billing. `renewal` is the heads-up
   * before a renewal; otherwise it's the one a few days into the lock.
   */
  | { kind: 'stillLocked'; renewsLabel: string; renewal: boolean }
  | { kind: 'trialEnding'; endsLabel: string }
  | { kind: 'test' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function hash(seed: string): number {
  let value = 5381;
  for (let index = 0; index < seed.length; index += 1) {
    value = ((value << 5) + value + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(value);
}

function pick(seed: string, options: string[], step?: number): string {
  // Rotating by step keeps back-to-back nudges from reading the same; the
  // seed decides where the rotation starts.
  return options[(hash(seed) + (step ?? 0)) % options.length];
}

/** "$25", "$12.50". */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** "45 min", "90 min", "5h", "3 days". Rounded the way a person would say it. */
export function formatTimeLeft(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes < 100) {
    const rounded = minutes < 10 ? minutes : Math.round(minutes / 5) * 5;
    return `${rounded} min`;
  }
  const hours = ms / HOUR;
  if (hours < 40) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)} days`;
}

/** "5pm", "5:30pm", "12am". */
function clockLabel(at: number, timeZone: string): string {
  const minutes = localClock(at, timeZone);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(minute).padStart(2, '0')}${suffix}`;
}

/** "5pm" today, "tomorrow 5pm", "Fri 5pm" this week, "Oct 3, 5pm" beyond. */
export function formatDueLabel(dueAt: number, now: number, timeZone: string): string {
  const clock = clockLabel(dueAt, timeZone);
  const dueDay = zonedDay(dueAt, timeZone);
  const today = zonedDay(now, timeZone);
  if (dueDay === today) return clock;
  if (dueDay === zonedDay(now + 24 * HOUR, timeZone) && dueAt - now < 48 * HOUR) {
    return `tomorrow ${clock}`;
  }
  if (dueAt - now < 6 * 24 * HOUR) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
      new Date(dueAt),
    );
    return `${weekday} ${clock}`;
  }
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(new Date(dueAt));
  return `${date}, ${clock}`;
}

/** A day to name in a sentence: "tomorrow", "Thursday" this week, "Oct 12" beyond. */
export function formatDayLabel(at: number, now: number, timeZone: string): string {
  const day = zonedDay(at, timeZone);
  if (day === zonedDay(now, timeZone)) return 'today';
  if (day === zonedDay(now + 24 * HOUR, timeZone) && at - now < 48 * HOUR) return 'tomorrow';
  if (at - now < 6 * 24 * HOUR) {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(at));
  }
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(
    new Date(at),
  );
}

/** "Run", "Run, Read, Stretch", "Run, Read, Stretch +2". */
function nameList(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function habitsCopy(message: Extract<ReminderMessage, { kind: 'habits' }>): PushCopy {
  const { habits, msLeft, final, seed, step } = message;
  const left = formatTimeLeft(msLeft);
  const [only] = habits;

  if (habits.length === 1 && only.weeklyNeeded !== undefined) {
    const needed = only.weeklyNeeded;
    if (final) {
      return {
        title: `Last call: ${only.title}`,
        body: `${left} to log it. Skip today and the week comes up short.`,
      };
    }
    return {
      title: `${only.title}, today`,
      body:
        needed === 1
          ? 'Last one this week. Today’s the day.'
          : pick(
              seed,
              [
                `${needed} more this week. No slack left.`,
                `Need ${needed} before the week’s out, so today counts.`,
              ],
              step,
            ),
    };
  }

  if (habits.length === 1) {
    if (final) {
      return {
        title: `Last call: ${only.title}`,
        body: pick(
          seed,
          [
            `${left} to log it, or ${missConsequence([only.stake])}.`,
            `${left}. One log keeps the streak alive.`,
          ],
          step,
        ),
      };
    }
    return {
      title: only.title,
      body: pick(
        seed,
        [
          `Still open. ${left} till 3am.`,
          `Not logged yet. ${left} on the clock.`,
          `Still waiting on your proof. ${left} left.`,
        ],
        step,
      ),
    };
  }

  const list = nameList(habits.map((habit) => habit.title));
  if (final) {
    return {
      title: `Last call: ${habits.length} still open`,
      body: `${list}. ${left}, or ${missConsequence(habits.map((habit) => habit.stake))}.`,
    };
  }
  return {
    title: `${habits.length} still open`,
    body: pick(seed, [`${list}. ${left} till 3am.`, `${list}. Clock’s running.`], step),
  };
}

function goalsCopy(message: Extract<ReminderMessage, { kind: 'goals' }>): PushCopy {
  const { goals, dueLabel, msLeft, final, seed, step } = message;
  const left = formatTimeLeft(msLeft);
  const staked = goals.reduce((sum, goal) => sum + (goal.stakeCents ?? 0), 0);
  const money = staked > 0 ? formatMoney(staked) : null;
  const subject = goals.length === 1 ? goals[0].title : `${goals.length} goals`;

  if (final) {
    return {
      title: `Last call: ${subject}`,
      body:
        money === null
          ? pick(seed, [`${left}. Get the proof in.`, `${left} left. Keep your word.`], step)
          : pick(
              seed,
              [
                `${left}. Proof or ${money}. Your move.`,
                `${left} left. ${money} is still yours, for now.`,
              ],
              step,
            ),
    };
  }

  if (msLeft >= 20 * HOUR) {
    return {
      title: `${subject} · due ${dueLabel}`,
      body:
        money === null
          ? pick(
              seed,
              ['Your word’s on it. Get ahead of it.', 'Plenty of time. Don’t spend it all.'],
              step,
            )
          : pick(
              seed,
              [
                `${money} riding on it. Get ahead of it.`,
                `${money} on the line. Plenty of time, so use it.`,
              ],
              step,
            ),
    };
  }

  return {
    title: `${subject}: ${left} left`,
    body:
      money === null
        ? `Proof by ${dueLabel}. Your word’s on it.`
        : pick(
            seed,
            [`Proof by ${dueLabel} or the ${money} goes.`, `${money} says you’ve got this.`],
            step,
          ),
  };
}

function lineupCopy(message: Extract<ReminderMessage, { kind: 'lineup' }>): PushCopy {
  const parts: string[] = [];
  if (message.habits.length > 0) parts.push(nameList(message.habits));
  for (const goal of message.goals) {
    const money = goal.stakeCents === null ? '' : ` (${formatMoney(goal.stakeCents)})`;
    parts.push(`${goal.title} due ${goal.dueLabel}${money}`);
  }
  return { title: 'Today’s lineup', body: parts.join(' · ') };
}

export function reminderCopy(message: ReminderMessage): PushCopy {
  switch (message.kind) {
    case 'habits':
      return habitsCopy(message);
    case 'goals':
      return goalsCopy(message);
    case 'lineup':
      return lineupCopy(message);
  }
}

/** Keeps the model's sentence from crowding out the time left. */
function clip(text: string, max = 110): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function eventCopy(message: EventMessage): PushCopy {
  switch (message.kind) {
    case 'rejected': {
      const retry =
        message.msLeft === null || message.msLeft <= 0
          ? ''
          : ` ${formatTimeLeft(message.msLeft)} left to retry.`;
      return {
        title:
          message.subject === 'goal'
            ? `${message.title}: proof didn’t pass`
            : message.method === 'location'
              ? `${message.title}: check-in didn’t pass`
              : `${message.title}: photo didn’t pass`,
        body: `${clip(message.reason)}${retry}`,
      };
    }
    case 'unchecked': {
      const retry =
        message.msLeft === null || message.msLeft <= 0
          ? 'That one’s on us.'
          : `That one’s on us. Try again, ${formatTimeLeft(message.msLeft)} left.`;
      return { title: `Couldn’t check your proof for ${message.title}`, body: retry };
    }
    case 'approved':
      if (message.subject === 'habit') {
        return { title: `${message.title}: logged`, body: 'Done for today. Nice.' };
      }
      return {
        title: `${message.title}: approved`,
        body:
          message.stakeCents === null
            ? 'Promise kept.'
            : `${formatMoney(message.stakeCents)} stays yours. Promise kept.`,
      };
    case 'charged':
      if (message.subject === 'habit') {
        return {
          title: `${message.title}: streak broken`,
          body:
            message.streak !== undefined && message.streak > 1
              ? `${message.streak} in a row, then a miss. ${formatMoney(message.amountCents)} was charged.`
              : `A miss, so ${formatMoney(message.amountCents)} was charged.`,
        };
      }
      return {
        title: `${message.title}: deadline passed`,
        body: `No proof came in, so ${formatMoney(message.amountCents)} was charged.`,
      };
    case 'declined':
      return {
        title: `${message.title}: your card declined`,
        body: `The ${formatMoney(message.amountCents)} didn’t go through. You still owe it, so settle up in Ante.`,
      };
    case 'friendTold':
      return {
        title: `${message.friendName} knows`,
        body: `You missed ${message.title}, so we emailed ${message.friendName}. Maybe get to them first.`,
      };
    case 'friendGone':
      return {
        title: `${message.friendName} won’t hear about ${message.title}`,
        body:
          message.why === 'bounced'
            ? `Our email to ${message.friendName} bounced. Pick someone else to answer to.`
            : `${message.friendName} opted out. Pick someone else to answer to.`,
      };
    case 'frozen':
      return {
        title: `${message.title}: streak broken`,
        body: `Your habits are frozen until ${message.untilLabel}. Goals keep running.`,
      };
    case 'thawed':
      return {
        title: 'Your habits are back',
        body: 'The freeze is over. Tomorrow counts.',
      };
    case 'stillLocked':
      if (message.renewal) {
        return {
          title: `Ante Pro renews ${message.renewsLabel}`,
          body: 'Ante is still locked. Pay the fee to get back in, or cancel in Settings before then if you’re done.',
        };
      }
      return {
        title: 'Ante is still locked',
        body: `Your Ante Pro subscription is still active and renews ${message.renewsLabel}. Pay the fee to get back in, or manage your subscription.`,
      };
    case 'trialEnding':
      return {
        title: `Your free week ends ${message.endsLabel}`,
        body: 'Ante Pro renews then. If it’s not for you, cancel in Settings before it does.',
      };
    case 'test':
      return {
        title: 'This is what a nudge looks like',
        body: 'Short. Only when something’s still open.',
      };
  }
}
