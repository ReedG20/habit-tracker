import { DEFAULT_TIMER_MINUTES, type ProofMethod } from '@/constants/proof-methods';
import type { Id } from '@/convex/_generated/dataModel';
import { snapEndDay } from '@/convex/lib/endDate';
import {
  DEFAULT_LOCKOUT_DAYS,
  DEFAULT_STAKE_CENTS as DEFAULT_CENTS,
  type LockoutDays,
  type StakeKind,
} from '@/convex/lib/stakeRules';
import { todayKey } from '@/lib/dates';

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
  /**
   * Habits only: the end date as picked (`convex/lib/endDate.ts`). Absent, the
   * default, runs until ended. Read it through `draftEndDay`, which snaps a
   * weekly habit's to the end of one of its weeks.
   */
  endsOn?: string;
  /**
   * Raises only: the day the running habit's weeks are anchored on, which a
   * raise keeps. New and restarted habits start today.
   */
  startDay?: string;
  /** `wordingSignature` of the last wording that passed the check, so it isn't re-asked. */
  checkedWording?: string;
  /**
   * A key from `convex/lib/commitmentIcons.ts`: the name check's pick for the
   * name, or the user's own once `iconChosen`, which the name check never moves.
   */
  icon?: string;
  iconChosen?: boolean;
  /** Goals only. */
  dueAt: number;
  stakeKind: StakeKind;
  amountCents: number;
  card: SavedCard | null;
  reuse?: ReusedCard;
  friend: FriendDraft;
  lockoutDays: LockoutDays;
};

/**
 * A preset under the name field: a name, and its proof in the words of the
 * method it's proven by. Habits only take a method; it's photo when left out.
 */
export type CommitmentSuggestion = {
  title: string;
  proof: string;
  proofMethod?: ProofMethod;
  timerMinutes?: number;
};

/** What picking a preset changes: for a habit, the method (and timer length) come with it. */
export function suggestionPatch(
  kind: CommitmentKind,
  suggestion: CommitmentSuggestion,
): Partial<CommitmentDraft> {
  const { title, proof, proofMethod = 'photo', timerMinutes } = suggestion;
  if (kind === 'goal') return { title, proof };
  return { title, proof, proofMethod, ...(timerMinutes !== undefined && { timerMinutes }) };
}

/** Whether `proof` is one of the presets' own lines, not something the user wrote. */
export function isPresetProof(
  proof: string,
  suggestions: CommitmentSuggestion[] | undefined,
): boolean {
  const trimmed = proof.trim();
  return (suggestions ?? []).some((suggestion) => suggestion.proof === trimmed);
}

/**
 * Once the name is checked, a habit takes the best-fit method until the user
 * picks one, unless they've written proof for the current one. A preset's
 * proof isn't theirs: when the best fit differs, that method's first idea
 * replaces it, so the method and its words never disagree.
 */
export function bestFitPatch(
  draft: Pick<CommitmentDraft, 'kind' | 'proof' | 'proofMethod'>,
  result: { bestMethod: ProofMethod | null; ideas: Record<ProofMethod, string[]> },
  suggestions: CommitmentSuggestion[] | undefined,
  methodPicked: boolean,
): Partial<CommitmentDraft> | null {
  const best = result.bestMethod;
  if (draft.kind !== 'habit' || methodPicked || best === null || best === draft.proofMethod) {
    return null;
  }
  const preset = isPresetProof(draft.proof, suggestions);
  if (draft.proof.trim().length > 0 && !preset) return null;
  return { proofMethod: best, ...(preset && { proof: result.ideas[best][0] ?? '' }) };
}

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

/** The icon fields every create call takes; nothing when no icon was picked. */
export function iconInput(
  draft: Pick<CommitmentDraft, 'icon' | 'iconChosen'>,
): { icon: string; iconChosen?: true } | Record<string, never> {
  if (draft.icon === undefined) return {};
  return draft.iconChosen === true ? { icon: draft.icon, iconChosen: true } : { icon: draft.icon };
}

/**
 * The last day a habit draft would count, as it will be signed and saved: a
 * weekly habit's weeks start today, so its end date moves to the end of one.
 * `undefined` for no end date, and for goals.
 */
export function draftEndDay(
  draft: Pick<CommitmentDraft, 'kind' | 'endsOn' | 'timesPerWeek' | 'startDay'>,
  today: string = todayKey(),
): string | undefined {
  if (draft.kind !== 'habit' || draft.endsOn === undefined) return undefined;
  const startDay = draft.startDay ?? today;
  return snapEndDay({ timesPerWeek: draft.timesPerWeek, startDay }, draft.endsOn);
}

/** The end date as `habits.create` takes it; nothing when it runs until ended. */
export function endDateInput(
  draft: Pick<CommitmentDraft, 'kind' | 'endsOn' | 'timesPerWeek' | 'startDay'>,
): { endsOn: string } | Record<string, never> {
  const endsOn = draftEndDay(draft);
  return endsOn === undefined ? {} : { endsOn };
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

/** How far out a new goal's deadline starts: room for a real goal, still close enough to feel. */
export const DEFAULT_DUE_DAYS = 20;

/** The evening `DEFAULT_DUE_DAYS` from now. */
export function defaultDueAt(now: number = Date.now()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + DEFAULT_DUE_DAYS);
  date.setHours(21, 0, 0, 0);

  return date.getTime();
}

/** `days` calendar days from today, at the time of day `dueAt` already has. */
export function dueInDays(days: number, dueAt: number, now: number = Date.now()): number {
  const time = new Date(dueAt);
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(time.getHours(), time.getMinutes(), 0, 0);

  return date.getTime();
}

/** Calendar days from today to `dueAt`'s day; rounded so a DST shift doesn't knock it off by one. */
export function daysUntil(dueAt: number, now: number = Date.now()): number {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dueAt);
  to.setHours(0, 0, 0, 0);

  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
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
