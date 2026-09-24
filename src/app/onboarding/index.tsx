import { useConvexAuth } from 'convex/react';
import { Image } from 'expo-image';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ControlHeight, Fonts, MaxContentWidth, PillRadius, Spacing } from '@/constants/theme';
import { completeOnboarding, resetOnboarding, useOnboarding } from '@/lib/onboarding';

// The splash screen's colour, so launch runs straight into this screen.
const BRAND = '#4121FF';
const ON_BRAND = '#FFFFFF';
const ON_BRAND_MUTED = 'rgba(255, 255, 255, 0.72)';

/**
 * Welcome. Full-bleed brand violet in both schemes: it is the one screen that
 * sells rather than works, and it carries on from the splash.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const { status, draft } = useOnboarding();

  // Imperative rather than a <StatusBar>: this screen stays mounted under the
  // next steps, and a mounted component would keep the bar white over them.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  // A relaunch mid-flow picks up where the commitment left off. Signed in, that
  // is the paywall even when the draft is already saved (and so cleared): the
  // flow isn't done until the paywall is answered.
  if (status === 'drafted' && isAuthenticated) {
    return <Redirect href="/onboarding/paywall" />;
  }
  if (status === 'drafted' && draft !== null) {
    return <Redirect href="/onboarding/save" />;
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.four },
      ]}>
      <View style={styles.content}>
        <Image
          source={require('@/assets/brand/ante-mark.svg')}
          style={styles.mark}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />

        <View style={styles.copy}>
          <ThemedText style={styles.headline}>Put something on the line.</ThemedText>
          <ThemedText style={styles.lede}>
            Ante holds you to the habits and goals you keep putting off — with proof, and with
            money.
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              resetOnboarding();
              router.push('/onboarding/how');
            }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              Get started
            </ThemedText>
          </Pressable>

          {/* Signed in, this is a replay from the Me screen's developer tools:
              there is no account to go and find, just a way back out. */}
          <Pressable
            accessibilityRole="button"
            onPress={completeOnboarding}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <ThemedText type="smallSemibold" style={styles.secondaryLabel}>
              {isAuthenticated ? 'Exit replay' : 'I already have an account'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND,
    paddingHorizontal: Spacing.three,
  },
  content: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    justifyContent: 'space-between',
  },
  // The SVG has generous padding around the wordmark; the negative margin
  // lines the wordmark itself up with the text below.
  mark: {
    width: 120,
    height: 120,
    marginLeft: -Spacing.three,
    marginTop: -Spacing.four,
  },
  copy: {
    gap: Spacing.three,
  },
  headline: {
    fontFamily: Fonts.wisdom,
    fontSize: 48,
    lineHeight: 56,
    color: ON_BRAND,
  },
  lede: {
    fontSize: 18,
    lineHeight: 26,
    color: ON_BRAND_MUTED,
  },
  actions: {
    gap: Spacing.three,
    alignItems: 'center',
  },
  // A white capsule like the sign-in buttons: a glass button would vanish into the violet.
  primary: {
    alignSelf: 'stretch',
    height: ControlHeight,
    borderRadius: PillRadius,
    backgroundColor: ON_BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: BRAND,
    fontSize: 16,
  },
  secondary: {
    paddingVertical: Spacing.one,
  },
  secondaryLabel: {
    color: ON_BRAND_MUTED,
  },
  pressed: {
    opacity: 0.72,
  },
});
