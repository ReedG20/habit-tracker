import { useSignInWithApple } from '@clerk/expo/apple';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { AppleIcon } from '@/constants/icons';
import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureError, track } from '@/lib/analytics';

export function AppleSignInButton() {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== 'ios') {
    return null;
  }

  const handlePress = async () => {
    setBusy(true);

    try {
      const { createdSessionId, setActive, signUp } = await startAppleAuthenticationFlow();

      // Navigation is handled by the root layout's auth guard once the session
      // becomes active, so there is nothing to route to here.
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // A brand-new account's session comes from the sign-up, not the sign-in.
        const isNew = createdSessionId === signUp?.createdSessionId;
        track(isNew ? 'signed up' : 'signed in', { method: 'apple' });
      }
    } catch (error) {
      // Dismissing the Apple sheet is not a failure worth surfacing.
      if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        captureError(error, 'apple sign in');
        Alert.alert('Could not sign in with Apple', describe(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Apple"
      disabled={busy}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.text },
        (pressed || busy) && styles.pressed,
      ]}>
      <View style={styles.content}>
        <Icon icon={AppleIcon} size={20} color={theme.background} />
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          Continue with Apple
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Clerk's own message when it has one (it's written for people); never a raw native exception. */
function describe(error: unknown): string {
  const clerk = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
  return (
    clerk?.longMessage ??
    clerk?.message ??
    'Check that this iPhone is signed in to an Apple Account in Settings, then try again.'
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    borderRadius: PillRadius,
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
