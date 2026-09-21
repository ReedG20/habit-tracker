import { StripeProvider as NativeStripeProvider } from '@stripe/stripe-react-native';
import type { ReactElement } from 'react';

// A static property read: Expo inlines `process.env.EXPO_PUBLIC_*` at build
// time, so a computed key would be undefined in a bundle.
const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

if (!publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY — in .env.local for dev, or the EAS environment for builds (see .env.example)',
  );
}

/** Wraps the app so `useStripe` works anywhere; `urlScheme` is where 3DS redirects come back to. */
export function StripeProvider({ children }: { children: ReactElement }) {
  return (
    <NativeStripeProvider publishableKey={publishableKey} urlScheme="ante">
      {children}
    </NativeStripeProvider>
  );
}
