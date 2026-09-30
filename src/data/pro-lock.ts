import { isMissed, type GoalWithStatus } from '@/data/goals';
import type { SubscriptionSummary } from '@/data/subscription';
import type { PaywallSource } from '@/lib/analytics-events';
import { formatShortDate } from '@/lib/dates';

/**
 * What Ante says without Ante Pro, in one voice everywhere it's said: habits
 * pause and nothing counts against them, goals already made run to their
 * deadline, and nothing new can start. Pure, so every branch is unit-tested.
 */

export type ProLockInput = {
  /** The subscription that ended, or `null` when there never was one. */
  summary: SubscriptionSummary | null;
  /** Habits the user has, all of them paused without Pro. */
  pausedHabits: number;
  /** Goals not yet done or missed: they still settle, and can still charge. */
  liveGoals: number;
};

/** Goals that can still settle, with or without Pro: not done, not missed. */
export function liveGoalCount(goals: GoalWithStatus[], now: number): number {
  return goals.filter((goal) => goal.completedAt === undefined && !isMissed(goal, now)).length;
}

export type ProLockRow = {
  id: 'habits' | 'goals' | 'new';
  label: string;
  /** One or two words, read against the label: "Paused", "Still running", "Locked". */
  status: string;
};

export type ProLockLedger = {
  title: string;
  rows: ProLockRow[];
  actionLabel: string;
};

/**
 * The card under a goal's hero on Today, and on Commitments: one line each
 * for what's paused, what still runs, and what's locked.
 */
export function proLockLedger({ summary, pausedHabits, liveGoals }: ProLockInput): ProLockLedger {
  const rows: ProLockRow[] = [];
  if (pausedHabits > 0) {
    rows.push({
      id: 'habits',
      label: pausedHabits === 1 ? '1 habit' : `${pausedHabits} habits`,
      status: 'Paused',
    });
  }
  if (liveGoals > 0) {
    rows.push({
      id: 'goals',
      label: liveGoals === 1 ? '1 goal' : `${liveGoals} goals`,
      status: 'Still running',
    });
  }
  rows.push({ id: 'new', label: 'New habits and goals', status: 'Locked' });
  return { title: kicker(summary), rows, actionLabel: actionLabel(summary) };
}

export type ProLockHeroCopy = {
  kicker: string;
  headline: string;
  sentence: string;
  /** The words in `sentence` set in bold. */
  emphasis: string[];
  /** The coach's margin note, in Mansalva: lowercase, one line, dry. */
  note: string;
  actionLabel: string;
};

/** The top of Today without Pro, when no goal has a moment of its own there. */
export function proLockHeroCopy({ summary, pausedHabits }: ProLockInput): ProLockHeroCopy {
  const locked = 'can’t start a new habit or goal';
  if (pausedHabits > 0) {
    return {
      kicker: kicker(summary),
      headline: pausedHabits === 1 ? 'Your habit is paused.' : 'Your habits are paused.',
      sentence: `Nothing counts against ${pausedHabits === 1 ? 'it' : 'them'} while Pro is off, and you ${locked} until you ${restartVerb(summary)}.`,
      emphasis: [locked],
      note: 'they’ll keep till you’re back.',
      actionLabel: actionLabel(summary),
    };
  }
  if (summary === null) {
    return {
      kicker: kicker(summary),
      headline: 'Nothing’s on the line.',
      sentence:
        'Every habit and goal in Ante runs on Ante Pro. Start it, then make your first one.',
      emphasis: ['Ante Pro'],
      note: 'no stakes, no point.',
      actionLabel: actionLabel(summary),
    };
  }
  return {
    kicker: kicker(summary),
    headline: 'Nothing’s on the line.',
    sentence: `You ${locked} until you resubscribe.`,
    emphasis: [locked],
    note: 'ready when you are.',
    actionLabel: actionLabel(summary),
  };
}

export type PaywallHeaderCopy = {
  title: string;
  subtitle: string;
};

/** The paywall's title block, for why it was opened and what the user has. */
export function paywallHeaderCopy({
  summary,
  pausedHabits,
  source,
}: {
  summary: SubscriptionSummary | null;
  pausedHabits: number;
  source: PaywallSource;
}): PaywallHeaderCopy {
  const lapsed = summary !== null;
  if (source === 'new') {
    return {
      title: lapsed ? 'Resubscribe to make a commitment.' : 'Start Ante Pro to make a commitment.',
      subtitle: 'Every habit and goal runs on Ante Pro. Once you’re in, you’ll pick up right here.',
    };
  }
  if (source === 'restart') {
    return {
      title: 'Resubscribe to restart it.',
      subtitle: 'Restarting a habit needs Ante Pro. Once you’re in, you’ll pick up right here.',
    };
  }
  if (!lapsed) {
    return {
      title: 'Put something on the line.',
      subtitle: 'Start Pro, then make your first commitment. It takes a minute.',
    };
  }
  const ended = endedAt(summary);
  const since = ended === null ? 'Ante Pro is off' : `Ante Pro ended ${ended}`;
  return pausedHabits > 0
    ? {
        title: 'Bring your habits back.',
        subtitle: `${since}. Resubscribe and your habits count again from tomorrow, with nothing owed for the days in between.`,
      }
    : {
        title: 'Resubscribe to Ante Pro.',
        subtitle: `${since}. Every new habit and goal runs on it.`,
      };
}

function endedAt(summary: SubscriptionSummary | null): string | null {
  return summary?.expiresAt === undefined ? null : formatShortDate(summary.expiresAt);
}

/** "Ante Pro ended Sep 12", or "No Ante Pro yet" for someone who never had it. */
function kicker(summary: SubscriptionSummary | null): string {
  if (summary === null) return 'No Ante Pro yet';
  const ended = endedAt(summary);
  return ended === null ? 'Ante Pro is off' : `Ante Pro ended ${ended}`;
}

function restartVerb(summary: SubscriptionSummary | null): string {
  return summary === null ? 'start Ante Pro' : 'resubscribe';
}

function actionLabel(summary: SubscriptionSummary | null): string {
  return summary === null ? 'Start Ante Pro' : 'Resubscribe';
}
