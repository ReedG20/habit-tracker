import { useSignInWithGoogle } from '@clerk/expo/google';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { GoogleIcon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
      const { createdSessionId, setActive } = await startGoogleAuthenticationFlow();

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (error) {
      const code = (error as { code?: string }).code;

      // Both codes mean the user backed out of the Google sheet.
      if (code !== 'SIGN_IN_CANCELLED' && code !== '-5') {
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius,
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
