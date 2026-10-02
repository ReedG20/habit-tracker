import { useEffect, useEffectEvent, useRef } from 'react';

import { ensureAiConsent, useAiConsent } from '@/lib/ai-consent';

/**
 * Photo and location proof are judged by AI, so a proof screen asks first
 * (once) and closes if the answer is no. Returns whether it may send.
 */
export function useAiProofConsent(onDeclined: () => void): boolean {
  const consent = useAiConsent();
  const asked = useRef(false);
  const declined = useEffectEvent(onDeclined);

  useEffect(() => {
    if (asked.current || consent === 'granted') return;
    asked.current = true;
    void ensureAiConsent('proof').then((allowed) => {
      if (!allowed) declined();
    });
  }, [consent]);

  return consent === 'granted';
}
