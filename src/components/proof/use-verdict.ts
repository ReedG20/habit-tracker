import { useQuery } from 'convex/react';
import { useEffect, useState } from 'react';

import type { ProofVerdict } from './proof-result';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

/** After this long, the screen offers to let the check finish in the background. */
const SLOW_AFTER_MS = 8000;

/**
 * Watches one attempt until its verdict lands. `slow` turns on once the check
 * has taken long enough that waiting on screen stops being worth it; the push
 * and the home screen still deliver the verdict after the screen closes.
 */
export function useVerdict(verificationId: Id<'habitVerifications'> | null): {
  verdict: ProofVerdict | null;
  slow: boolean;
} {
  const row = useQuery(
    api.verifications.get,
    verificationId === null ? 'skip' : { verificationId },
  );
  const [slowFor, setSlowFor] = useState<Id<'habitVerifications'> | null>(null);

  useEffect(() => {
    if (verificationId === null) return;
    const timeout = setTimeout(() => setSlowFor(verificationId), SLOW_AFTER_MS);
    return () => clearTimeout(timeout);
  }, [verificationId]);

  const verdict =
    row == null || row.status === 'pending' ? null : { status: row.status, reason: row.reason };
  return { verdict, slow: verdict === null && slowFor !== null && slowFor === verificationId };
}
