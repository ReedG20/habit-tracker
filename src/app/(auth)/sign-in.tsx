import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { resetOnboarding } from '@/lib/onboarding';

const WISDOM = 'The life you want to live is behind the work you don’t want to do';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.four },
      ]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText style={styles.wisdom}>{WISDOM}</ThemedText>
          <ThemedText themeColor="textSecondary">
            Sign in to keep your habits and streaks in sync.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <AppleSignInButton />
          <GoogleSignInButton />
          {/* The way back for someone who tapped "I already have an account" by mistake. */}
          <Pressable
            accessibilityRole="button"
            onPress={resetOnboarding}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.getStarted, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              New to Ante?{' '}
              <ThemedText type="smallSemibold" themeColor="text">
                Get started
              </ThemedText>
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  content: {
    flex: 1,
    alignSelf: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  header: {
    paddingTop: Spacing.six,
    gap: Spacing.three,
  },
  wisdom: {
    fontFamily: Fonts.wisdom,
    fontSize: 32,
    lineHeight: 40,
  },
  actions: {
    gap: Spacing.two,
  },
  getStarted: {
    alignSelf: 'center',
    paddingTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
