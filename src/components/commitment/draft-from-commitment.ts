import { FRESH_PROOF, wordingSignature, type CommitmentDraft } from './draft';

import type { Revisable } from '@/convex/callOff';
import { DAILY } from '@/convex/lib/frequency';
import { cardLabel } from '@/lib/money';

/**
 * A commitment still in its window (`callOff.revisable`), as the New flow's
 * draft: everything it was signed with, so changing one term doesn't mean
 * typing the rest again. Its wording already passed the check, and a money
 * stake keeps the card it was on.
 */
export function draftFromRevisable(revisable: Revisable): Partial<CommitmentDraft> {
  const words = {
    kind: revisable.kind,
    title: revisable.title,
    proof: revisable.description ?? '',
    proofMethod: revisable.proofMethod ?? FRESH_PROOF.proofMethod,
  };
  const { stake } = revisable;

  return {
    ...words,
    timesPerWeek: revisable.timesPerWeek ?? DAILY,
    timerMinutes: revisable.timerMinutes ?? FRESH_PROOF.timerMinutes,
    checkedWording: wordingSignature(words),
    icon: revisable.icon,
    iconChosen: revisable.iconChosen,
    ...(revisable.dueAt === undefined ? {} : { dueAt: revisable.dueAt }),
    stakeKind: stake?.kind ?? 'none',
    ...(stake?.kind === 'money'
      ? {
          amountCents: stake.amountCents,
          reuse:
            stake.cardLast4 === undefined
              ? undefined
              : { fromStakeId: stake.stakeId, label: cardLabel(stake), on: true },
        }
      : {}),
    ...(stake?.kind === 'friend'
      ? { friend: { friendId: stake.friendId, name: stake.name, email: stake.email } }
      : {}),
    ...(stake?.kind === 'lockout' ? { lockoutDays: stake.days } : {}),
  };
}
