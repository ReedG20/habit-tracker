import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import type { Signed } from '@/components/signed-contract/types';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { captureError } from '@/lib/analytics';

export type ContractTarget = { habitId: Id<'habits'> } | { goalId: Id<'goals'> };

/**
 * Keeps the contract just signed, for the Kept and loss screens to show again.
 * Fire and forget: the commitment is already made, and a failed save only
 * means its ending shows without the contract.
 */
export function useSignContract(): (target: ContractTarget, signed: Signed) => void {
  const sign = useMutation(api.contracts.sign);
  return useCallback(
    (target, signed) => {
      sign({ target, ...signed }).catch((error: unknown) => {
        console.warn('Could not keep the signed contract', error);
        captureError(error, 'sign contract');
      });
    },
    [sign],
  );
}
