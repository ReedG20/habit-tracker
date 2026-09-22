import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Alert02Icon, CheckmarkCircle02Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** `alert` is the default because most toasts report something going wrong. */
export type ToastTone = 'alert' | 'success';

export type Toast = {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
};

const DISMISS_AFTER_MS = 6_000;

// One toast at a time, app-wide: a new one replaces the current one.
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showToast(title: string, message?: string, tone: ToastTone = 'alert') {
  current = { id: nextId++, title, message, tone };
  emit();
}

function dismissToast(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mount once per screen that can raise toasts, as a sibling of the scroll view. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => dismissToast(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (toast === null) return null;

  return (
    <Animated.View
      key={toast.id}
      // Slide, not fade: glass renders nothing under a parent whose opacity animates.
      entering={SlideInUp}
      exiting={SlideOutUp}
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + Spacing.two }]}>
      <Pressable
        accessibilityRole="alert"
        onPress={() => dismissToast(toast.id)}
        style={[
          styles.toast,
          glass ? null : [styles.solid, { backgroundColor: theme.backgroundElement }],
        ]}>
        {glass ? (
          <GlassView
            pointerEvents="none"
            // UIKit takes the radius literally, so it's repeated on the glass itself.
            style={[StyleSheet.absoluteFill, styles.glass]}
            glassEffectStyle="regular"
          />
        ) : null}
        <Icon
          icon={toast.tone === 'success' ? CheckmarkCircle02Icon : Alert02Icon}
          size={22}
          color={toast.tone === 'success' ? theme.primary : theme.accent}
        />
        <ThemedText style={styles.text}>
          <ThemedText type="smallSemibold">{toast.title}</ThemedText>
          {toast.message ? (
            <ThemedText type="small" themeColor="textSecondary">
              {'\n'}
              {toast.message}
            </ThemedText>
          ) : null}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 480,
    width: '100%',
    padding: Spacing.three,
    borderRadius: CardRadius,
  },
  glass: {
    borderRadius: CardRadius,
  },
  // Off iOS 26 there is no glass, so the toast lifts off the content instead.
  solid: {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  text: {
    flex: 1,
  },
});
