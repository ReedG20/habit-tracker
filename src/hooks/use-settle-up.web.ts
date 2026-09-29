import type { SettleUp } from './use-settle-up';

/** No Stripe SDK on web: settling up happens in the app. */
export function useSettleUp(): SettleUp {
  return {
    supported: false,
    settle: () => Promise.reject(new Error('Settle up in the Ante app')),
  };
}
