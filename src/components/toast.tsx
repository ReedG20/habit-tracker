import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

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
  if (toast === null) return null;
  return <ToastView key={toast.id} toast={toast} />;
}

/** Past this, or flicked up faster than `FLING_VELOCITY`, a drag sends the toast away. */
const SWIPE_DISTANCE = 24;
const FLING_VELOCITY = 400;

/** One toast: tap it, or swipe it back up, to dismiss it early. */
function ToastView({ toast }: { toast: Toast }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const glass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const top = insets.top + Spacing.two;

  const offset = useSharedValue(0);
  // A finger on it holds it: it can't time out mid-drag.
  const [held, setHeld] = useState(false);
  // Swiped off already: it leaves without sliding out a second time.
  const [swiped, setSwiped] = useState(false);

  useEffect(() => {
    if (held || swiped) return;
    const timer = setTimeout(() => dismissToast(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast.id, held, swiped]);

  // Dismissed a render after `swiped`, so the unmount sees no exit animation.
  useEffect(() => {
    if (swiped) dismissToast(toast.id);
  }, [toast.id, swiped]);

  const dismiss = () => dismissToast(toast.id);
  const swipeAway = () => setSwiped(true);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => {
      scheduleOnRN(setHeld, true);
    })
    .onUpdate((event) => {
      // Up follows the finger; down only gives a little, as it has nowhere to go.
      offset.set(event.translationY < 0 ? event.translationY : event.translationY * 0.15);
    })
    .onEnd((event) => {
      if (event.translationY < -SWIPE_DISTANCE || event.velocityY < -FLING_VELOCITY) {
        offset.set(
          withTiming(-(top + 240), { duration: 200 }, (finished) => {
            if (finished) scheduleOnRN(swipeAway);
          }),
        );
      } else {
        offset.set(withSpring(0, { damping: 18 }));
      }
    })
    .onFinalize(() => {
      scheduleOnRN(setHeld, false);
    });
  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(dismiss);
  });

  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));

  return (
    <Animated.View
      // Slide, not fade: glass renders nothing under a parent whose opacity animates.
      entering={SlideInUp}
      exiting={swiped ? undefined : SlideOutUp}
      pointerEvents="box-none"
      style={[styles.host, { top }]}>
      {/* The app has no root for gestures, so the toast brings its own. */}
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
          <Animated.View
            accessible
            accessibilityRole="alert"
            accessibilityHint="Double tap to dismiss"
            onAccessibilityTap={dismiss}
            style={[
              styles.toast,
              glass ? null : [styles.solid, { backgroundColor: theme.backgroundElement }],
              dragStyle,
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
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
  root: {
    width: '100%',
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
