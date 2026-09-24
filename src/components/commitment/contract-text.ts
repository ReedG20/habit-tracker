import type { CommitmentDraft } from './draft';

import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/** A run of contract text; `strong` runs are the terms the user filled in. */
export type ContractRun = { text: string; strong?: boolean };

/** The contract as one "I will…" paragraph, with the user's own terms marked. */
export function contractRuns(draft: CommitmentDraft): ContractRun[] {
  if (draft.kind === 'habit') {
    return [
      { text: 'I will ' },
      { text: lowerFirst(draft.title), strong: true },
      { text: ', every day. Each day I’ll prove it with a photo showing ' },
      { text: lowerFirst(draft.proof), strong: true },
      { text: '. If I miss a day, ' },
      { text: 'Ante locks until I pay to get back in', strong: true },
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
