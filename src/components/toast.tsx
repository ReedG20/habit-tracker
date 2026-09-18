import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Alert02Icon } from '@/constants/icons';
import { CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Toast = {
  id: number;
  title: string;
  message?: string;
};

const DISMISS_AFTER_MS = 6_000;

// One toast at a time, app-wide: a new one replaces the current one.
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showToast(title: string, message?: string) {
  current = { id: nextId++, title, message };
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

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => dismissToast(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (toast === null) return null;

  return (
    <Animated.View
      key={toast.id}
      entering={FadeInUp}
      exiting={FadeOutUp}
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + Spacing.two }]}>
      <Pressable
        accessibilityRole="alert"
        onPress={() => dismissToast(toast.id)}
        style={[styles.toast, { backgroundColor: theme.backgroundElement }]}>
        <Icon icon={Alert02Icon} size={22} color={theme.accent} />
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
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  text: {
    flex: 1,
  },
});
