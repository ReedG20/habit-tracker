import { DEFAULT_TIMER_MINUTES, type ProofMethod } from '@/constants/proof-methods';
import type { Id } from '@/convex/_generated/dataModel';
import {
  DEFAULT_LOCKOUT_DAYS,
  DEFAULT_STAKE_CENTS as DEFAULT_CENTS,
  type LockoutDays,
  type StakeKind,
} from '@/convex/lib/stakeRules';

export type CommitmentKind = 'habit' | 'goal';

/** A card saved through Stripe for one specific amount; the server re-checks the match. */
export type SavedCard = { setupIntentId: string; amountCents: number };

/** A card from an earlier stake, for "go again" without the sheet. `on` while it's chosen. */
export type ReusedCard = { fromStakeId: Id<'stakes'>; label: string; on: boolean };

/** Who hears about a miss: someone picked from before, or someone new. */
export type FriendDraft = { friendId?: Id<'friends'>; name: string; email: string };

/**
 * Everything the three steps collect, held by the screen so going back never
 * loses it. Each kind of stake keeps its own settings, so switching between
 * them and back doesn't lose what was set.
 */
export type CommitmentDraft = {
  kind: CommitmentKind;
  title: string;
  /**
   * What counts as proof, judged against by the checks: what the photo shows,
   * where to check in, or what happens while the timer runs.
   */
  proof: string;
  /** Habits only: days a week it is due, on any days; 7 is every day. */
  timesPerWeek: number;
  /** Habits only; goals are always proved with photos. */
  proofMethod: ProofMethod;
  /** Timer habits only, but kept while switching so it isn't lost. */
  timerMinutes: number;
  /** `wordingSignature` of the last wording that passed the check, so it isn't re-asked. */
  checkedWording?: string;
  /** Goals only. */
  dueAt: number;
  stakeKind: StakeKind;
  amountCents: number;
  card: SavedCard | null;
  reuse?: ReusedCard;
  friend: FriendDraft;
  lockoutDays: LockoutDays;
};

/** The server refuses anything closer than a minute; the flow mirrors it. */
export const MIN_LEAD_MS = 60 * 1000;

export const DEFAULT_STAKE_CENTS = DEFAULT_CENTS;

export const EMPTY_FRIEND: FriendDraft = { name: '', email: '' };

/** The proof fields of a fresh draft. */
export const FRESH_PROOF: Pick<CommitmentDraft, 'proofMethod' | 'timerMinutes'> = {
  proofMethod: 'photo',
  timerMinutes: DEFAULT_TIMER_MINUTES,
};

/** How a habit draft is proved, as `habits.create` takes it. Goals send nothing. */
export function proofInput(
  draft: CommitmentDraft,
): { proofMethod: ProofMethod; timerMinutes?: number } | Record<string, never> {
  if (draft.kind !== 'habit') return {};
  return draft.proofMethod === 'timer'
    ? { proofMethod: 'timer', timerMinutes: draft.timerMinutes }
    : { proofMethod: draft.proofMethod };
}

/** A goal is always proved with photos, whatever the habit side of the draft holds. */
export function draftProofMethod(
  draft: Pick<CommitmentDraft, 'kind' | 'proofMethod'>,
): ProofMethod {
  return draft.kind === 'habit' ? draft.proofMethod : 'photo';
}

/** Money unless it can't be had here; then a friend who hears about a miss. */
export function defaultStakeKind(allowMoney: boolean): StakeKind {
  return allowMoney ? 'money' : 'friend';
}

/** The stake fields of a fresh draft. */
export function freshStake(
  allowMoney: boolean,
): Pick<CommitmentDraft, 'stakeKind' | 'amountCents' | 'card' | 'friend' | 'lockoutDays'> {
  return {
    stakeKind: defaultStakeKind(allowMoney),
    amountCents: DEFAULT_STAKE_CENTS,
    card: null,
    friend: EMPTY_FRIEND,
    lockoutDays: DEFAULT_LOCKOUT_DAYS,
  };
}

/** Tomorrow evening: far enough to be a real goal, near enough to feel urgent. */
export function defaultDueAt(now: number = Date.now()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(21, 0, 0, 0);

  return date.getTime();
}

/** The saved card, if it was saved for exactly the amount on the stake. */
export function cardForStake(draft: CommitmentDraft): SavedCard | null {
  if (draft.stakeKind !== 'money' || draft.card === null) return null;

  return draft.card.amountCents === draft.amountCents ? draft.card : null;
}

/** The earlier card, while it's the one chosen for a money stake. */
export function reuseForStake(draft: CommitmentDraft): ReusedCard | null {
  if (draft.stakeKind !== 'money' || draft.reuse === undefined) return null;

  return draft.reuse.on ? draft.reuse : null;
}

/** The friend as the server takes it. */
export function friendInput(
  friend: FriendDraft,
): { friendId: Id<'friends'> } | { name: string; email: string } {
  return friend.friendId !== undefined
    ? { friendId: friend.friendId }
    : { name: friend.name.trim(), email: friend.email.trim() };
}

/** Loose on purpose: the server has the last word. */
export function isFriendComplete(friend: FriendDraft): boolean {
  if (friend.friendId !== undefined) return true;
  return friend.name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friend.email.trim());
}

/** Any stake short of money, as `habits.create` and `habits.restart` take it. */
export function plainStake(
  draft: CommitmentDraft,
):
  | { kind: 'none' }
  | { kind: 'lockout'; days: LockoutDays }
  | { kind: 'friend'; friend: ReturnType<typeof friendInput> } {
  switch (draft.stakeKind) {
    case 'friend':
      return { kind: 'friend', friend: friendInput(draft.friend) };
    case 'lockout':
      return { kind: 'lockout', days: draft.lockoutDays };
    default:
      return { kind: 'none' };
  }
}

/** "1 day", "3 days", "a week". */
export function lockoutLabel(days: LockoutDays): string {
  if (days === 7) return 'a week';
  return days === 1 ? '1 day' : `${days} days`;
}

/** What a draft saved before the kinds of stakes existed meant. */
export function upgradeDraft(draft: CommitmentDraft): CommitmentDraft {
  // Stored as JSON by an older build, so any of the stake fields may be missing.
  const stored = draft as Partial<CommitmentDraft> & Pick<CommitmentDraft, 'kind'>;
  const legacyAmount = stored.amountCents as number | null | undefined;
  const fresh = freshStake(false);
  return {
    ...draft,
    stakeKind: stored.stakeKind ?? (legacyAmount == null ? fresh.stakeKind : 'money'),
    amountCents: legacyAmount ?? DEFAULT_STAKE_CENTS,
    card: stored.card ?? null,
    friend: stored.friend ?? EMPTY_FRIEND,
    lockoutDays: stored.lockoutDays ?? DEFAULT_LOCKOUT_DAYS,
    proofMethod: stored.proofMethod ?? FRESH_PROOF.proofMethod,
    timerMinutes: stored.timerMinutes ?? FRESH_PROOF.timerMinutes,
  };
}

/** What the wording check looked at; a draft whose signature still matches needs no second look. */
export function wordingSignature(
  draft: Pick<CommitmentDraft, 'kind' | 'title' | 'proof'> & { proofMethod?: ProofMethod },
): string {
  const method = draft.kind === 'habit' ? (draft.proofMethod ?? 'photo') : 'photo';
  return [draft.kind, method, draft.title.trim(), draft.proof.trim()].join('\n');
}
