import { useSignInWithGoogle } from '@clerk/expo/google';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { GoogleIcon } from '@/constants/icons';
import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureError, track } from '@/lib/analytics';

/** Google's native SDK only ships for iOS and Android. */
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export function GoogleSignInButton() {
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  if (!SUPPORTED) {
    return null;
  }

  const handlePress = async () => {
    setBusy(true);

    try {
      const { createdSessionId, setActive, signUp } = await startGoogleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // A brand-new account's session comes from the sign-up, not the sign-in.
        const isNew = createdSessionId === signUp?.createdSessionId;
        track(isNew ? 'signed up' : 'signed in', { method: 'google' });
      }
    } catch (error) {
      const code = (error as { code?: string }).code;

      // Both codes mean the user backed out of the Google sheet.
      if (code !== 'SIGN_IN_CANCELLED' && code !== '-5') {
        captureError(error, 'google sign in');
        Alert.alert('Could not sign in with Google', describe(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={busy}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        (pressed || busy) && styles.pressed,
      ]}>
      <View style={styles.content}>
        <Icon icon={GoogleIcon} size={20} />
        <ThemedText type="smallBold">Continue with Google</ThemedText>
      </View>
    </Pressable>
  );
}

/** Clerk's own message when it has one (it's written for people); never a raw native exception. */
function describe(error: unknown): string {
  const clerk = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
  return clerk?.longMessage ?? clerk?.message ?? 'Check your connection and try again.';
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    borderRadius: PillRadius,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
