import type { IconSvgElement } from '@hugeicons/react-native';

import {
  Calendar03Icon,
  Camera01Icon,
  CoinsDollarIcon,
  LockKeyholeIcon,
  RepeatIcon,
  Tick02Icon,
  UserIcon,
} from '@/constants/icons';
import { formatMinutes, PROOF_METHODS, proofMethodOf } from '@/constants/proof-methods';
import type { Doc } from '@/convex/_generated/dataModel';
import { daysBetween } from '@/convex/lib/days';
import { DAILY, frequencyLabel, targetPerWeek } from '@/convex/lib/frequency';
import type { StakeView } from '@/convex/lib/stakeRules';
import { formatLastDay } from '@/data/ending';
import { type Habit } from '@/data/habits';
import { describeGoalStake, freezeLength } from '@/data/stakes';
import {
  dayKeyAt,
  describeTimeLeft,
  describeWeekSpan,
  formatDayKey,
  formatDueAt,
  formatShortDate,
} from '@/lib/dates';
import { cardLabel, formatCents } from '@/lib/money';

/**
 * A commitment's terms, one line each, as the detail screens lay them out:
 * what it is, in the user's words, and what that means in practice.
 */
export type Term = {
  key: string;
  icon: IconSvgElement;
  label: string;
  value: string;
  note?: string;
  /** Live and at stake right now: drawn in the accent. */
  accent?: boolean;
};

export function habitTerms(habit: Habit & { stakeView: StakeView | null }, today: string): Term[] {
  return [
    habitProofTerm(habit),
    habitScheduleTerm(habit),
    stakeTerm(habit.stakeView, missPhrase(habit)),
    startedTerm(habit.startDay ?? dayKeyAt(habit._creationTime), today),
  ];
}

/** "Started Sep 12", and how long it has been going. */
function startedTerm(startDay: string, today: string): Term {
  const days = daysBetween(startDay, today).length - 1;
  return {
    key: 'started',
    icon: Calendar03Icon,
    label: 'Started',
    value: formatDayKey(startDay),
    note: days <= 0 ? 'Today.' : days === 1 ? 'Yesterday.' : `${days} days ago.`,
  };
}

export function goalTerms(
  goal: Doc<'goals'> & { stakeView: StakeView | null },
  now: number,
): Term[] {
  const description = goal.description?.trim() ?? '';
  const done = goal.completedAt !== undefined;
  return [
    {
      key: 'proof',
      icon: Camera01Icon,
      label: 'Proof · Photos',
      value: description.length > 0 ? description : 'Photos of it done',
      note: 'Photos and a note, checked by AI against this.',
    },
    {
      key: 'deadline',
      icon: Calendar03Icon,
      label: 'Deadline',
      value: formatDueAt(goal.dueAt),
      note: done ? undefined : describeTimeLeft(goal.dueAt, now),
    },
    stakeTerm(goal.stakeView, 'miss the deadline'),
    {
      key: 'started',
      icon: Calendar03Icon,
      label: 'Set',
      value: formatShortDate(goal._creationTime),
    },
  ];
}

/** Which method, and what it has to show: the part of the deal that's easiest to forget. */
function habitProofTerm(habit: Habit): Term {
  const method = proofMethodOf(habit);
  const description = habit.description?.trim() ?? '';
  const icon = PROOF_METHODS[method].icon;
  switch (method) {
    case 'photo':
      return {
        key: 'proof',
        icon,
        label: 'Proof · Photo',
        value: description.length > 0 ? description : 'A photo of it done',
        note: 'Taken in Ante, then checked by AI against this.',
      };
    case 'location':
      return {
        key: 'proof',
        icon,
        label: 'Proof · Check in',
        value: description.length > 0 ? description : 'The place you named',
        note: 'Check in when you get there. Ante matches it to the places around you.',
      };
    case 'timer':
      return {
        key: 'proof',
        icon,
        label: 'Proof · Timer',
        value: `${formatMinutes(habit.timerMinutes ?? 0)} with Ante open`,
        note:
          description.length > 0
            ? `While it runs: ${description}`
            : 'Leaving the app stops it. Start again any time.',
      };
  }
}

function habitScheduleTerm(habit: Habit): Term {
  const target = targetPerWeek(habit);
  const rule =
    target >= DAILY
      ? 'Log it by 3\u00a0AM, every day.'
      : `Any days you like, ${describeWeekSpan(habit.startDay ?? dayKeyAt(habit._creationTime))}.`;
  return {
    key: 'schedule',
    icon: RepeatIcon,
    label: 'How often',
    value: frequencyLabel(target),
    note:
      habit.endsAfter !== undefined
        ? `${rule} Ending: it counts through ${formatLastDay(habit.endsAfter)}.`
        : habit.endsOn !== undefined
          ? `${rule} It runs through ${formatLastDay(habit.endsOn)}, then it’s done.`
          : rule,
  };
}

/** "miss a day", "end a week short": the end of "…if you ___". */
function missPhrase(habit: Pick<Habit, 'timesPerWeek'>): string {
  return targetPerWeek(habit) >= DAILY ? 'miss a day' : 'end a week short';
}

type Stake<Kind extends StakeView['kind']> = Extract<StakeView, { kind: Kind }>;

const STAKE_TERM = { key: 'stake', label: 'On the line' };

function stakeTerm(stake: StakeView | null, miss: string): Term {
  if (stake === null) {
    return {
      ...STAKE_TERM,
      icon: Tick02Icon,
      value: 'Just your word',
      note: `Nothing happens if you ${miss}, except you know.`,
    };
  }
  switch (stake.kind) {
    case 'money':
      return moneyTerm(stake, miss);
    case 'friend':
      return friendTerm(stake, miss);
    case 'lockout':
      return lockoutTerm(stake, miss);
  }
}

function moneyTerm(stake: Stake<'money'>, miss: string): Term {
  const amount = formatCents(stake.amountCents);
  if (stake.status !== 'armed') {
    return {
      ...STAKE_TERM,
      icon: CoinsDollarIcon,
      value: describeGoalStake(stake, 'detail') ?? amount,
    };
  }
  return {
    ...STAKE_TERM,
    icon: CoinsDollarIcon,
    value: amount,
    note: `Charged to ${cardLabel(stake)} if you ${miss}.`,
    accent: true,
  };
}

function friendTerm(stake: Stake<'friend'>, miss: string): Term {
  const name = stake.friendName;
  const term = { ...STAKE_TERM, icon: UserIcon };
  switch (stake.status) {
    case 'armed':
      return { ...term, value: name, note: `Hears about it if you ${miss}.`, accent: true };
    case 'told':
      return { ...term, value: `${name} was told` };
    case 'released':
      return { ...term, value: `${name} is off the hook` };
    case 'void':
      return {
        ...term,
        value: `${name} opted out`,
        note: 'It’s on your word until you pick a new friend.',
        accent: true,
      };
  }
}

function lockoutTerm(stake: Stake<'lockout'>, miss: string): Term {
  const length = freezeLength(stake.days);
  const term = { ...STAKE_TERM, icon: LockKeyholeIcon };
  switch (stake.status) {
    case 'armed':
      return {
        ...term,
        value: `${stake.days >= 7 ? '1-week' : `${stake.days}-day`} freeze`,
        note: `If you ${miss}, every habit freezes for ${length}.`,
        accent: true,
      };
    case 'triggered':
      return { ...term, value: `Froze every habit for ${length}` };
    case 'released':
      return { ...term, value: 'Lock released' };
  }
}
