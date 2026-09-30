import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingProgress } from './onboarding-progress';

import { Icon } from '@/components/icon';
import { ScrollEdgeFooter, ScrollEdgeHeader } from '@/components/scroll-footer/scroll-edge-footer';
import { useScrollEdge } from '@/components/scroll-footer/use-scroll-edge';
import { ThemedText } from '@/components/themed-text';
import { ArrowLeft01Icon } from '@/constants/icons';
import { MaxContentWidth, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import type { ProgressStep } from '@/data/onboarding';
import { useTheme } from '@/hooks/use-theme';

export type OnboardingScreenProps = {
  /** Omit for screens without a progress bar (the paywall). */
  step?: ProgressStep;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Floats over the bottom of the scroll view, above the keyboard: the step's main action. */
  footer?: ReactNode;
  /** Hide the back row, e.g. when a resumed flow has nothing behind it. */
  hideBack?: boolean;
};

/**
 * The frame every onboarding step shares: progress, a back row, a Comico title,
 * then the step's content, with its action pinned to the bottom. The same
 * "‹ Back" + large title pattern as the rest of the app's pushed screens.
 */
export function OnboardingScreen({
  step,
  title,
  subtitle,
  children,
  footer,
  hideBack = false,
}: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const canGoBack = !hideBack && router.canGoBack();
  const edge = useScrollEdge();
  const footerHeight = footer === undefined ? 0 : edge.footerHeight;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The keyboard pads this in, so the floating footer rides above it. */}
      <View style={styles.screen} collapsable={false}>
        <View style={[styles.column, styles.top, { paddingTop: insets.top + Spacing.two }]}>
          {step !== undefined ? <OnboardingProgress step={step} /> : null}
          <View style={styles.backRow}>
            {canGoBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                hitSlop={Spacing.three}
                style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                <Icon icon={ArrowLeft01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
                <ThemedText type="small" themeColor="textSecondary">
                  Back
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Its own box, so the top edge sits where the scroll view starts. */}
        <View style={styles.scroll} collapsable={false}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.column,
              styles.content,
              { paddingBottom: Spacing.four + footerHeight },
            ]}
            {...edge.scrollProps}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            alwaysBounceVertical={false}>
            <View style={styles.heading}>
              <ThemedText style={styles.title} themeColor="text">
                {title}
              </ThemedText>
              {subtitle !== undefined ? (
                <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>
              ) : null}
            </View>
            {children}
          </ScrollView>
          <ScrollEdgeHeader {...edge.headerProps} />
        </View>

        {footer !== undefined ? (
          <ScrollEdgeFooter
            {...edge.footerProps}
            style={{ paddingBottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }}>
            <View style={[styles.column, styles.footer]}>{footer}</View>
          </ScrollEdgeFooter>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  column: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
  },
  top: {
    gap: Spacing.three,
  },
  // Holds its height when there is no back button, so titles line up across steps.
  backRow: {
    minHeight: 24,
    justifyContent: 'center',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  heading: {
    gap: Spacing.two,
  },
  title: ScreenHeadingTypography,
  footer: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
