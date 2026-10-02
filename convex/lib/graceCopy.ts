import type { Doc } from '../_generated/dataModel';
import { dayOfWeek } from './days';
import { layout, paragraph, type EmailContent } from './emailCopy';
import { formatDueLabel, formatMoney, type PushCopy } from './reminderCopy';

/**
 * Every word about the one-time reprieve (`lib/grace.ts`): the push, the
 * email, and the screen the app opens. Shared by the backend and the app.
 *
 * Every surface says the same two things: what the miss would have cost, and
 * that this happens once. It should read as a warning that came with a
 * reprieve, not a perk. Never "pass", "free", "credit" or "grace".
 */

/** What a stake put on the line, in the copy's terms. */
export type GraceStake =
  | { kind: 'money'; cents: number }
  | { kind: 'friend'; name: string }
  | { kind: 'lockout'; days: number };

export function graceStakeLine(stake: Doc<'stakes'>): GraceStake {
  switch (stake.kind) {
    case 'money':
      return { kind: 'money', cents: stake.amountCents };
    case 'friend':
      return { kind: 'friend', name: stake.friendName };
    case 'lockout':
      return { kind: 'lockout', days: stake.days };
  }
}

/** Several stakes as one: the money adds up; otherwise the harshest of the rest. */
function combined(stakes: GraceStake[]): GraceStake {
  const cents = stakes.reduce((sum, stake) => sum + (stake.kind === 'money' ? stake.cents : 0), 0);
  if (cents > 0) return { kind: 'money', cents };
  const days = Math.max(0, ...stakes.map((stake) => (stake.kind === 'lockout' ? stake.days : 0)));
  if (days > 0) return { kind: 'lockout', days };
  return stakes.find((stake) => stake.kind === 'friend') ?? { kind: 'money', cents: 0 };
}

export const ONCE_TITLE = 'We only do this once.';

/** "Morning run", "Morning run and Read", "Morning run, Read and Stretch". */
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? '';
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

function daysLabel(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** The sentence after "You missed …": what it would have cost. */
function wouldHave(stake: GraceStake): string {
  switch (stake.kind) {
    case 'money':
      return `That would have cost you ${formatMoney(stake.cents)}.`;
    case 'friend':
      return `That’s when ${stake.name} would have heard about it.`;
    case 'lockout':
      return `That would have frozen your habits for ${daysLabel(stake.days)}.`;
  }
}

/** The warning under "We only do this once.": the stake is still live, and what the next miss does. */
export function onceBody(kind: 'waived' | 'extended', stake: GraceStake): string {
  if (kind === 'extended') {
    return stake.kind === 'friend'
      ? `Don’t count on it again. Miss this deadline and ${stake.name} hears about it.`
      : `Don’t count on it again. Miss this deadline and the ${formatMoney(stake.kind === 'money' ? stake.cents : 0)} goes.`;
  }
  switch (stake.kind) {
    case 'money':
      return `Don’t count on it again. Your ${formatMoney(stake.cents)} is still on the line, and the next miss is charged.`;
    case 'friend':
      return `Don’t count on it again. ${stake.name} is still on the line, and hears about the next miss.`;
    case 'lockout':
      return `Don’t count on it again. The lockout is still on, and the next miss freezes your habits for ${daysLabel(stake.days)}.`;
  }
}

/** The end of "Next miss, …" in a push. */
function nextMiss(stake: GraceStake): string {
  switch (stake.kind) {
    case 'money':
      return `your ${formatMoney(stake.cents)} is charged`;
    case 'friend':
      return `${stake.name} hears about it`;
    case 'lockout':
      return 'your habits freeze';
  }
}

export type GracePushInput =
  | { kind: 'waived'; titles: string[]; stakes: GraceStake[] }
  | {
      kind: 'extended';
      titles: string[];
      stakes: GraceStake[];
      extendedTo: number;
      now: number;
      timeZone: string;
    };

export function gracePushCopy(input: GracePushInput): PushCopy {
  const stake = combined(input.stakes);
  if (input.kind === 'extended') {
    const until = formatDueLabel(input.extendedTo, input.now, input.timeZone);
    const lose =
      stake.kind === 'friend'
        ? `${stake.name} hears about it`
        : `the ${formatMoney(stake.kind === 'money' ? stake.cents : 0)} goes`;
    return {
      title: `Deadline passed: ${input.titles[0]}`,
      body: `We moved it to ${until}. That’s a one-time thing. Send proof by then or ${lose}.`,
    };
  }
  return {
    title:
      input.titles.length === 1
        ? `You missed ${input.titles[0]}`
        : `You missed ${input.titles.length} habits`,
    body: `We let it go, and only this once. Next miss, ${nextMiss(stake)}.`,
  };
}

export type GraceStoryInput = {
  kind: 'waived' | 'extended';
  titles: string[];
  stakes: GraceStake[];
  /** Waived: the day missed, or the first day of the week that came up short. */
  missedPeriod?: string;
  /** Waived: whether that period is a week. */
  weekly?: boolean;
  originalDueAt?: number;
  extendedTo?: number;
  now: number;
  timeZone: string;
};

export type GraceStory = {
  /** Small caps above the headline. */
  kicker: string;
  headline: string;
  /** One plain sentence; `emphasis` are the parts set in bold. */
  line: string;
  emphasis: string[];
  once: { title: string; body: string };
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Tuesday", or "Week of Sep 28" for a weekly habit. */
function missedLabel(period: string, weekly: boolean): string {
  if (!weekly) return WEEKDAYS[dayOfWeek(period)];
  const [, month, day] = period.split('-').map(Number);
  const monthName = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `Week of ${monthName} ${day}`;
}

/** The grace screen's words, top to bottom. */
export function graceStory(input: GraceStoryInput): GraceStory {
  const stake = combined(input.stakes);
  const once = { title: ONCE_TITLE, body: onceBody(input.kind, stake) };

  if (input.kind === 'extended') {
    const title = input.titles[0] ?? '';
    const passed =
      input.originalDueAt === undefined
        ? 'Deadline passed'
        : `Deadline passed · ${formatDueLabel(input.originalDueAt, input.now, input.timeZone)}`;
    const until =
      input.extendedTo === undefined
        ? 'a little longer'
        : formatDueLabel(input.extendedTo, input.now, input.timeZone);
    return {
      kicker: passed,
      headline: `You’ve got until ${until}.`,
      line: `${title} wasn’t proven in time, so we moved your deadline.`,
      emphasis: [title],
      once,
    };
  }

  const kicker =
    input.missedPeriod === undefined
      ? 'Missed'
      : `Missed · ${missedLabel(input.missedPeriod, input.weekly === true)}`;
  const emphasis = [...input.titles];
  if (stake.kind === 'money') emphasis.push(formatMoney(stake.cents));
  return {
    kicker,
    headline: 'This one’s on us.',
    line: `You missed ${joinTitles(input.titles)}. ${wouldHave(stake)}`,
    emphasis,
    once,
  };
}

/** The email that goes with the push: the same words, for anyone who has notifications off. */
export function graceEmail(input: GraceStoryInput & { userName: string }): EmailContent {
  const story = graceStory(input);
  const push =
    input.kind === 'extended'
      ? gracePushCopy({ ...input, extendedTo: input.extendedTo ?? input.now })
      : gracePushCopy({ kind: 'waived', titles: input.titles, stakes: input.stakes });
  const paragraphs = [
    `Hi ${input.userName},`,
    story.line,
    `${story.headline} ${story.once.title} ${story.once.body}`,
    input.kind === 'extended' ? 'Open Ante to send your proof.' : 'Open Ante to see it.',
    '— Ante',
  ];
  const footer = 'You’re getting this because something you staked on Ante came due.';
  return {
    subject: push.title,
    text: [...paragraphs, footer].join('\n\n'),
    html: layout(paragraphs.map(paragraph).join(''), footer),
  };
}
