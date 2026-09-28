import type { CommitmentDraft } from './draft';

import { DAILY, frequencyLabel } from '@/convex/lib/frequency';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/** A run of contract text; `strong` runs are the terms the user filled in. */
export type ContractRun = { text: string; strong?: boolean };

/**
 * The contract as one "I will…" paragraph, with the user's own terms marked.
 * `reentryPrice` is the fee as the store sells it (`$9.99`), when known.
 */
export function contractRuns(draft: CommitmentDraft, reentryPrice: string | null): ContractRun[] {
  const lock = {
    text:
      reentryPrice === null
        ? 'Ante locks until I pay to get back in'
        : `Ante locks until I pay ${reentryPrice} to get back in`,
    strong: true,
  };

  if (draft.kind === 'habit' && draft.timesPerWeek < DAILY) {
    return [
      { text: 'I will ' },
      { text: lowerFirst(draft.title), strong: true },
      { text: ', ' },
      { text: frequencyLabel(draft.timesPerWeek).toLowerCase(), strong: true },
      { text: '. Each time I’ll prove it with a photo showing ' },
      { text: lowerFirst(draft.proof), strong: true },
      { text: '. If I end a week short, ' },
      lock,
      { text: '.' },
    ];
  }

  if (draft.kind === 'habit') {
    return [
      { text: 'I will ' },
      { text: lowerFirst(draft.title), strong: true },
      { text: ', every day. Each day I’ll prove it with a photo showing ' },
      { text: lowerFirst(draft.proof), strong: true },
      { text: '. If I miss a day, ' },
      lock,
      { text: '.' },
    ];
  }

  return [
    { text: 'I will ' },
    { text: lowerFirst(draft.title), strong: true },
    { text: ' by ' },
    { text: formatDueAt(draft.dueAt), strong: true },
    { text: '. I’ll prove it with a photo showing ' },
    { text: lowerFirst(draft.proof), strong: true },
    { text: '. If I don’t, ' },
    draft.amountCents === null
      ? { text: 'I broke my word to myself', strong: true }
      : { text: `${formatCents(draft.amountCents)} is charged to my card`, strong: true },
    { text: '.' },
  ];
}

/** "Go to the gym" reads as "I will go to the gym"; acronyms and names keep their capital. */
function lowerFirst(text: string): string {
  const trimmed = text.trim().replace(/[.!]+$/, '');
  const [first, second] = trimmed;
  if (
    first === undefined ||
    (second !== undefined && second === second.toUpperCase() && /[A-Z]/.test(second))
  ) {
    return trimmed;
  }

  return first.toLowerCase() + trimmed.slice(1);
}
