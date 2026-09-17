import { useSignInWithApple } from '@clerk/expo/apple';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { AppleIcon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();

      // Navigation is handled by the root layout's auth guard once the session
      // becomes active, so there is nothing to route to here.
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (error) {
      // Dismissing the Apple sheet is not a failure worth surfacing.
      if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
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
