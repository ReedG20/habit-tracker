import { draftEndDay, draftProofMethod, lockoutLabel, type CommitmentDraft } from './draft';

import { DAILY, frequencyLabel } from '@/convex/lib/frequency';
import { formatLastDay } from '@/data/ending';
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

/** How one session gets proved, as a bare action: "prove it with a photo", "finish a 20-minute timer". */
export function proofAction(draft: CommitmentDraft): string {
  switch (draftProofMethod(draft)) {
    case 'photo':
      return 'prove it with a photo';
    case 'location':
      return 'check in from the place';
    case 'timer':
      return `finish a ${draft.timerMinutes}-minute timer with Ante open`;
  }
}

/** The proof on one line of a summary card: "Photo: …", "Check in at: …", "20 min timer: …". */
export function proofSummary(draft: CommitmentDraft): string {
  const proof = draft.proof.trim();
  switch (draftProofMethod(draft)) {
    case 'photo':
      return `Photo: ${proof}`;
    case 'location':
      return `Check in at: ${proof}`;
    case 'timer':
      // What happens while it runs is optional.
      return proof.length > 0
        ? `${draft.timerMinutes} min timer: ${proof}`
        : `${draft.timerMinutes} min timer`;
  }
}

/** The proof as the middle of a sentence: "… prove it with a photo showing <proof>". */
function proofRuns(draft: CommitmentDraft): ContractRun[] {
  const proof = { text: lowerFirst(draft.proof), strong: true };
  switch (draftProofMethod(draft)) {
    case 'photo':
      return [{ text: 'prove it with a photo showing ' }, proof];
    case 'location':
      return [{ text: 'check in with my location at ' }, proof];
    case 'timer': {
      const timer: ContractRun[] = [
        { text: 'keep Ante open for a ' },
        { text: `${draft.timerMinutes}-minute`, strong: true },
      ];
      // What happens while it runs is optional.
      return draft.proof.trim().length > 0
        ? [...timer, { text: ' timer while I ' }, proof]
        : [...timer, { text: ' timer' }];
    }
  }
}

/** ", through Thu, Oct 30" for a habit with an end date; nothing for one that runs until ended. */
function throughRuns(draft: CommitmentDraft): ContractRun[] {
  const endDay = draftEndDay(draft);
  if (endDay === undefined) return [];
  return [{ text: ', through ' }, { text: formatLastDay(endDay), strong: true }];
}

/** The contract as one "I will…" paragraph, with the user's own terms marked. */
export function contractRuns(draft: CommitmentDraft): ContractRun[] {
  return withAuthorization(draft, promiseRuns(draft));
}

/**
 * Signed, so a money stake's charge is authorized in the contract itself, by
 * an adult. Kept in the receipt too: it's the evidence for a disputed charge.
 */
function withAuthorization(draft: CommitmentDraft, runs: ContractRun[]): ContractRun[] {
  return draft.stakeKind === 'money'
    ? [...runs, { text: ' I’m 18 or older, and I authorize Ante to make this charge.' }]
    : runs;
}

function promiseRuns(draft: CommitmentDraft): ContractRun[] {
  const lock = { text: missConsequence(draft), strong: true };

  if (draft.kind === 'habit' && draft.timesPerWeek < DAILY) {
    return [
      { text: 'I will ' },
      { text: lowerFirst(draft.title), strong: true },
      { text: ', ' },
      { text: frequencyLabel(draft.timesPerWeek).toLowerCase(), strong: true },
      ...throughRuns(draft),
      { text: '. Each time I’ll ' },
      ...proofRuns(draft),
      { text: '. If I end a week short, ' },
      lock,
      { text: '.' },
    ];
  }

  if (draft.kind === 'habit') {
    return [
      { text: 'I will ' },
      { text: lowerFirst(draft.title), strong: true },
      { text: ', every day' },
      ...throughRuns(draft),
      { text: '. Each day I’ll ' },
      ...proofRuns(draft),
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

/**
 * The contract cut down to the promise and the price, for the copy that's
 * kept and shown again when the commitment ends. The proof is left out: by
 * then it has either been shown or it hasn't.
 */
export function receiptRuns(draft: CommitmentDraft): ContractRun[] {
  return withAuthorization(draft, receiptPromiseRuns(draft));
}

function receiptPromiseRuns(draft: CommitmentDraft): ContractRun[] {
  const lock = { text: missConsequence(draft), strong: true };
  const promise = { text: lowerFirst(draft.title), strong: true };

  if (draft.kind === 'habit' && draft.timesPerWeek < DAILY) {
    return [
      { text: 'I will ' },
      promise,
      { text: ', ' },
      { text: frequencyLabel(draft.timesPerWeek).toLowerCase(), strong: true },
      ...throughRuns(draft),
      { text: '. If I end a week short, ' },
      lock,
      { text: '.' },
    ];
  }

  if (draft.kind === 'habit') {
    return [
      { text: 'I will ' },
      promise,
      { text: ', every day' },
      ...throughRuns(draft),
      { text: '. If I miss a day, ' },
      lock,
      { text: '.' },
    ];
  }

  return [
    { text: 'I will ' },
    promise,
    { text: ' by ' },
    { text: formatDueAt(draft.dueAt), strong: true },
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
