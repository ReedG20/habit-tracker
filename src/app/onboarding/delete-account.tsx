import { useConvexAuth } from 'convex/react';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { DeleteAccountScreen } from '@/components/delete-account-screen';
import { resetOnboarding } from '@/lib/onboarding';

/**
 * The paywall's way out for someone who signed up but won't subscribe. Once
 * the account is gone (deleting signs out), onboarding starts over.
 */
export default function OnboardingDeleteAccountScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const signedOut = !isLoading && !isAuthenticated;

  useEffect(() => {
    if (signedOut) resetOnboarding();
  }, [signedOut]);

  if (signedOut) return <Redirect href="/onboarding" />;
  return <DeleteAccountScreen backLabel="Back" />;
}
