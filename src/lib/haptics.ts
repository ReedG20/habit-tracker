import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Web has no haptics engine; the calls would only log warnings there.
const supported = Platform.OS !== 'web';

/** A light tick for picking an option. */
export function selectionHaptic() {
  if (supported) void Haptics.selectionAsync();
}

/** Something landed: a commitment saved, a subscription started. */
export function successHaptic() {
  if (supported) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Something was lost: a heavy thud, then the error buzz. */
export function lossHaptic() {
  if (!supported) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, 180);
}
