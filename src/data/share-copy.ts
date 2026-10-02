import { DAILY, frequencyLabel } from '@/convex/lib/frequency';
import { isMilestone } from '@/convex/lib/milestones';
import type { ShareStake, ShareSubject } from '@/convex/share';
import { howEarly } from '@/data/kept-story';
import { formatCents } from '@/lib/money';

/**
 * The words on a share card and in the caption that goes with it. Pure, so
 * every case is tested. Written in the first person: the user is the one
 * posting it. A friend is never named, and the amount only shows when the
 * user leaves it on.
 */

export type ShareCardKind = 'stake' | 'streak' | 'kept';

/**
 * Where the share sheet was opened from. `onboarding` is the first
 * commitment's "It's on."; `milestone` is a streak milestone's moment.
 */
export type ShareSource =
  | 'locked_in'
  | 'onboarding'
  | 'raise'
  | 'restart'
  | 'detail'
  | 'kept'
  | 'milestone';

export type ShareCopy = {
  kicker: string;
  /** The big line: an amount, a count, or a few words. */
  hero: string;
  /** Under a count: "days in a row". */
  heroUnit?: string;
  /** How often, or by when: "Every day", "by Fri, Oct 24". */
  cadence: string;
  /** The sentence under the hero. */
  line: string;
  /** What's riding on it, in a line. */
  stakeLine: string;
  /** The handwritten aside, lowercase. */
  note: string;
  /** The post's text, before the link. */
  caption: string;
};

/** The cards one subject can make, the first being the one to open on. */
export function cardsFor(subject: ShareSubject): ShareCardKind[] {
  if (subject.kept !== undefined) return ['kept'];
  return subject.streak === undefined ? ['stake'] : ['streak', 'stake'];
}

/** Whether the card has an amount to hide. */
export function hasAmount(subject: ShareSubject): boolean {
  return subject.stake.kind === 'money';
}

const dueFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function cadenceOf(subject: ShareSubject): string {
  if (subject.commitment === 'goal') {
    return subject.dueAt === undefined ? 'A goal' : `by ${dueFormat.format(subject.dueAt)}`;
  }
  return frequencyLabel(subject.timesPerWeek ?? DAILY);
}

/** "$50", or "money" with the amount hidden. */
function amountOf(stake: Extract<ShareStake, { kind: 'money' }>, showAmount: boolean): string {
  return showAmount ? formatCents(stake.amountCents) : 'money';
}

function stakeCard(subject: ShareSubject, showAmount: boolean): ShareCopy {
  const { stake, title } = subject;
  const base = { kicker: 'On the line', cadence: cadenceOf(subject) };
  switch (stake.kind) {
    case 'money': {
      const amount = amountOf(stake, showAmount);
      return {
        ...base,
        hero: showAmount ? amount : 'Real money',
        line: 'If I miss, it’s gone.',
        stakeLine: `${showAmount ? amount : 'Money'} on the line until it’s done.`,
        note: 'it’s cheaper to just do it.',
        caption: `Just put ${amount} on “${title}”. If I miss, it’s gone.`,
      };
    }
    case 'friend':
      return {
        ...base,
        hero: 'A friend',
        line: 'If I miss, they hear about it.',
        stakeLine: 'A friend hears about it if I slip.',
        note: 'no pressure.',
        caption: `Just committed to “${title}”. If I miss, a friend hears about it.`,
      };
    case 'lockout':
      return {
        ...base,
        hero: `${plural(stake.days, 'day')} locked`,
        line: 'If I miss, my habits freeze.',
        stakeLine: `A ${stake.days}-day lockout if I slip.`,
        note: 'the lock is the point.',
        caption: `Just committed to “${title}”. If I miss, I’m locked out for ${plural(stake.days, 'day')}.`,
      };
    case 'none':
      return {
        ...base,
        hero: 'My word',
        line: 'Signed, in writing.',
        stakeLine: 'Nothing on it but my word.',
        note: 'watch me.',
        caption: `Just committed to “${title}”. On my word.`,
      };
  }
}

function streakStakeLine(stake: ShareStake, showAmount: boolean): string {
  switch (stake.kind) {
    case 'money':
      return showAmount
        ? `${formatCents(stake.amountCents)} on the line the whole way.`
        : 'Money on the line the whole way.';
    case 'friend':
      return 'A friend hears about it if I slip.';
    case 'lockout':
      return `A ${stake.days}-day lockout if I slip.`;
    case 'none':
      return 'On my word alone.';
  }
}

function streakCard(subject: ShareSubject, showAmount: boolean): ShareCopy {
  const run = subject.streak ?? { count: 0, unit: 'day' };
  const unit = run.unit === 'week' ? 'week' : 'day';
  const stakeLine = streakStakeLine(subject.stake, showAmount);
  // On the day it reaches one, the card says which.
  const milestone = isMilestone(run.count, unit);
  return {
    kicker: milestone ? `${plural(run.count, unit)} straight` : 'Still going',
    hero: String(run.count),
    heroUnit: `${unit}${run.count === 1 ? '' : 's'} in a row`,
    cadence: cadenceOf(subject),
    // The hero has the count; this says how clean it is.
    line: unit === 'day' ? 'Not one day missed.' : 'Not one week short.',
    stakeLine,
    note: 'not stopping now.',
    caption: milestone
      ? `${plural(run.count, unit)} straight of “${subject.title}”. Not stopping now. ${stakeLine}`
      : `${plural(run.count, unit)} in a row of “${subject.title}”, and counting. ${stakeLine}`,
  };
}

function keptStakeLine(stake: ShareStake, showAmount: boolean): string {
  switch (stake.kind) {
    case 'money':
      return showAmount
        ? `${formatCents(stake.amountCents)} stayed mine.`
        : 'The money stayed mine.';
    case 'friend':
      return 'My friend never heard a thing.';
    case 'lockout':
      return 'Not one freeze.';
    case 'none':
      return 'Kept my word.';
  }
}

function keptCard(subject: ShareSubject, showAmount: boolean): ShareCopy {
  const stakeLine = keptStakeLine(subject.stake, showAmount);
  const run = subject.kept?.run;
  // The card's stamp already says "kept".
  const base = { kicker: 'Seen through', cadence: cadenceOf(subject), stakeLine };

  if (subject.commitment === 'goal' || run === undefined) {
    const achievedAt = subject.kept?.achievedAt;
    const when =
      subject.dueAt === undefined || achievedAt === undefined
        ? ''
        : `, ${howEarly(subject.dueAt, achievedAt)}`;
    return {
      ...base,
      hero: 'Done.',
      line: `Proved it${when}.`,
      note: 'nobody can take this one back.',
      caption: `Done: “${subject.title}”${when}. ${stakeLine}`,
    };
  }

  const length = plural(run.count, run.unit);
  return {
    ...base,
    hero: String(run.count),
    heroUnit: `${run.unit}${run.count === 1 ? '' : 's'}.`,
    line: 'Kept it right to the last day.',
    note: 'finished on my terms.',
    caption: `Kept “${subject.title}” for ${length}, right to the last day. ${stakeLine}`,
  };
}

export function shareCopy(
  subject: ShareSubject,
  card: ShareCardKind,
  showAmount: boolean,
): ShareCopy {
  switch (card) {
    case 'stake':
      return stakeCard(subject, showAmount);
    case 'streak':
      return streakCard(subject, showAmount);
    case 'kept':
      return keptCard(subject, showAmount);
  }
}

/** The text that goes with the image: the caption, then the link on its own line. */
export function shareMessage(copy: ShareCopy, url: string): string {
  return `${copy.caption}\n\n${url}`;
}
