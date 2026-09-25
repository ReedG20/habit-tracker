export type CommitmentKind = 'habit' | 'goal';

/** A card saved through Stripe for one specific amount; the server re-checks the match. */
export type SavedCard = { setupIntentId: string; amountCents: number };

/** Everything the three steps collect, held by the screen so going back never loses it. */
export type CommitmentDraft = {
  kind: CommitmentKind;
  title: string;
  /** What the photo has to show; the vision model judges proof against it. */
  proof: string;
  /** Habits only: days a week it is due, on any days; 7 is every day. */
  timesPerWeek: number;
  /** `wordingSignature` of the last wording that passed the check, so it isn't re-asked. */
  checkedWording?: string;
  /** Goals only. */
  dueAt: number;
  /** `null` means no money on it. Goals only. */
  amountCents: number | null;
  card: SavedCard | null;
};

/** The server refuses anything closer than a minute; the flow mirrors it. */
export const MIN_LEAD_MS = 60 * 1000;

export const DEFAULT_STAKE_CENTS = 1000;

/** Tomorrow evening: far enough to be a real goal, near enough to feel urgent. */
export function defaultDueAt(now: number = Date.now()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(21, 0, 0, 0);

  return date.getTime();
}

/** The saved card, if it was saved for exactly the amount on the goal. */
export function cardForStake(draft: CommitmentDraft): SavedCard | null {
  if (draft.amountCents === null || draft.card === null) return null;

  return draft.card.amountCents === draft.amountCents ? draft.card : null;
}

/** What the wording check looked at; a draft whose signature still matches needs no second look. */
export function wordingSignature(draft: Pick<CommitmentDraft, 'kind' | 'title' | 'proof'>): string {
  return [draft.kind, draft.title.trim(), draft.proof.trim()].join('\n');
}
