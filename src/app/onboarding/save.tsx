import { useConvexAuth } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { CommitmentSummary } from '@/components/onboarding/commitment-summary';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { commitmentNoun } from '@/data/onboarding';
import { useOnboarding } from '@/lib/onboarding';

/**
 * The account ask, placed after the effort rather than before it. The sign-in
 * buttons only activate the session; this screen moves on once Convex has
 * accepted it, and the paywall saves the draft.
 */
export default function SaveScreen() {
  const { isAuthenticated } = useConvexAuth();
  const { draft } = useOnboarding();

  useEffect(() => {
    if (isAuthenticated) router.replace('/onboarding/paywall');
  }, [isAuthenticated]);

  if (draft === null) {
    return <Redirect href="/onboarding" />;
  }

  const noun = commitmentNoun(draft.kind);

  return (
    <OnboardingScreen
      step="save"
      title={`Save your ${noun}`}
      subtitle={`Make an account so Ante can hold you to it. Your ${noun} is saved the moment you’re in.`}
      footer={
        <View style={styles.actions}>
          <AppleSignInButton />
          <GoogleSignInButton />
        </View>
      }>
      <CommitmentSummary draft={draft} />
      <ThemedText type="small" themeColor="textSecondary">
        Changed your mind? Go back and edit it — nothing is saved until you sign in.
      </ThemedText>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.two,
  },
});
