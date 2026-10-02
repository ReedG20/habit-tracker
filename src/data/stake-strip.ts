import type { IconSvgElement } from '@hugeicons/react-native';

import { CoinsDollarIcon, LockKeyholeIcon, UserIcon } from '@/constants/icons';
import type { StakeView } from '@/convex/lib/stakeRules';
import { freezeLength } from '@/data/stakes';
import { formatShortDate } from '@/lib/dates';
import { cardLabel, formatCents } from '@/lib/money';

/**
 * The stake as a detail screen leads with it, right under the title: a big
 * figure ("$25", "Sam", "3 days"), what it is ("on the line") and what that
 * means. "The deal" further down still lists it with the rest of the terms.
 */
export type StakeStrip = {
  icon: IconSvgElement;
  figure: string;
  label: string;
  note?: string;
  /**
   * `live`: riding on it now, in the accent. `lost`: came due. `kept`: made it
   * through, in the Kept screen's violet. `quiet`: settled, nothing to say.
   */
  tone: 'live' | 'lost' | 'kept' | 'quiet';
  /** The money is gone (or came back after it went): struck through. */
  struck?: boolean;
};

export type StakeStripOptions = {
  /** Ante Pro has ended: nothing is checked or charged until it's back. */
  paused?: boolean;
};

/**
 * `null` for "just your word": nothing to lead with, and the deal says so.
 * Kept to a line or two; what counts as a miss, and where a friend's email
 * goes, are in the deal.
 */
export function stakeStrip(
  stake: StakeView | null,
  { paused = false }: StakeStripOptions = {},
): StakeStrip | null {
  if (stake === null) return null;
  const strip = stripOf(stake);
  if (paused && strip.tone === 'live') {
    return { ...strip, tone: 'quiet', note: 'Paused while Ante Pro is off.' };
  }
  return strip;
}

type Stake<Kind extends StakeView['kind']> = Extract<StakeView, { kind: Kind }>;

function stripOf(stake: StakeView): StakeStrip {
  switch (stake.kind) {
    case 'money':
      return moneyStrip(stake);
    case 'friend':
      return friendStrip(stake);
    case 'lockout':
      return lockoutStrip(stake);
  }
}

function moneyStrip(stake: Stake<'money'>): StakeStrip {
  const base = { icon: CoinsDollarIcon, figure: formatCents(stake.amountCents) };
  const missed =
    stake.lostAt === undefined ? undefined : `Missed ${formatShortDate(stake.lostAt)}.`;
  switch (stake.status) {
    case 'armed':
      return {
        ...base,
        label: 'on the line',
        note: `Charged to ${cardLabel(stake)} if you miss.`,
        tone: 'live',
      };
    case 'charging':
      return { ...base, label: 'being charged', note: missed, tone: 'lost' };
    case 'charged':
      return { ...base, label: 'charged', note: missed, tone: 'lost', struck: true };
    case 'disputed':
      return { ...base, label: 'disputed', note: missed, tone: 'lost', struck: true };
    case 'charge_failed':
      return {
        ...base,
        label: stake.failureKind === 'declined' ? 'card declined' : 'charge failed',
        note: missed,
        tone: 'lost',
      };
    case 'released':
      return { ...base, label: 'kept', note: 'Never charged.', tone: 'kept' };
    case 'refunded':
      return { ...base, label: 'refunded', note: missed, tone: 'quiet', struck: true };
  }
}

function friendStrip(stake: Stake<'friend'>): StakeStrip {
  const base = { icon: UserIcon, figure: stake.friendName };
  switch (stake.status) {
    case 'armed':
      return {
        ...base,
        label: 'is watching',
        note: 'Hears about it if you miss.',
        tone: 'live',
      };
    case 'void':
      return {
        ...base,
        label: 'opted out',
        note: 'Pick a new friend to keep it on.',
        tone: 'live',
      };
    case 'told':
      return { ...base, label: 'was told', tone: 'lost' };
    case 'released':
      return { ...base, label: 'never heard a thing', tone: 'kept' };
  }
}

function lockoutStrip(stake: Stake<'lockout'>): StakeStrip {
  const length = freezeLength(stake.days);
  const base = { icon: LockKeyholeIcon, figure: stake.days >= 7 ? '1 week' : length };
  switch (stake.status) {
    case 'armed':
      return {
        ...base,
        label: 'freeze on the line',
        note: 'Every habit freezes if you miss.',
        tone: 'live',
      };
    case 'triggered':
      return { ...base, label: 'freeze', note: `Every habit froze for ${length}.`, tone: 'lost' };
    case 'released':
      return { ...base, label: 'freeze', note: 'Lock released.', tone: 'quiet' };
  }
}
