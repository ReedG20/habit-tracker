import { useStripe } from '@stripe/stripe-react-native';
import { useAction } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { formatCents } from '@/lib/money';

export type CollectCardResult = { kind: 'saved'; setupIntentId: string } | { kind: 'canceled' };

export type StakePayment = {
  /** `false` where the Stripe SDK cannot run (web). */
  supported: boolean;
  /** Saves a card for the stake. Throws on anything other than the user backing out. */
  collectCard: (amountCents: number) => Promise<CollectCardResult>;
};

/**
 * The card half of putting money on a goal: mints the SetupIntent on the
 * server, then hands it to Stripe's PaymentSheet. The goal itself is created
 * by the caller once this resolves with `saved`.
 */
export function useStakePayment(): StakePayment {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const beginStake = useAction(api.goals.beginStake);

  return {
    supported: true,
    collectCard: async (amountCents) => {
      const setup = await beginStake({ amountCents });

      const init = await initPaymentSheet({
        merchantDisplayName: 'Ante',
        customerId: setup.customerId,
        customerSessionClientSecret: setup.customerSessionClientSecret,
        setupIntentClientSecret: setup.setupIntentClientSecret,
        // Card only, so no redirect flow needs it, but the SDK warns without one.
        returnURL: 'ante://stripe-redirect',
        allowsDelayedPaymentMethods: false,
        primaryButtonLabel: `Put ${formatCents(amountCents)} on it`,
      });
      if (init.error) {
        throw new Error(init.error.message);
      }

      const { error } = await presentPaymentSheet();
      if (error?.code === 'Canceled') {
        return { kind: 'canceled' };
      }
      if (error) {
        throw new Error(error.message);
      }

      return { kind: 'saved', setupIntentId: setup.setupIntentId };
    },
  };
}
