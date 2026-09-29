import { lockoutLabel, type CommitmentDraft } from './draft';

import { DAILY, frequencyLabel } from '@/convex/lib/frequency';
import { formatDueAt } from '@/lib/dates';
import { formatCents } from '@/lib/money';

/** A run of contract text; `strong` runs are the terms the user filled in. */
export type ContractRun = { text: string; strong?: boolean };

/** The friend's first name, or "my friend" before one is picked. */
export function friendName(draft: CommitmentDraft): string {
  const name = draft.friend.name.trim();
  return name.length > 0 ? name : 'my friend';
}

/** What a miss costs, as the end of "If I miss a day, ___". */
export function missConsequence(draft: CommitmentDraft): string {
  switch (draft.stakeKind) {
    case 'money':
      return `${formatCents(draft.amountCents)} is charged to my card`;
    case 'friend':
      return `${friendName(draft)} hears about it`;
    case 'lockout':
      return `all my habits freeze for ${lockoutLabel(draft.lockoutDays)}`;
    case 'none':
      return draft.kind === 'habit' ? 'my streak starts over' : 'I broke my word to myself';
  }
}

/** The contract as one "I will…" paragraph, with the user's own terms marked. */
export function contractRuns(draft: CommitmentDraft): ContractRun[] {
  const lock = { text: missConsequence(draft), strong: true };

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
    lock,
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
