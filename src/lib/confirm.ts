import { Alert, Platform } from 'react-native';

export type ConfirmDestructiveOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

/** `Alert` is not implemented on react-native-web, so the browser prompt stands in. */
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  onConfirm,
}: ConfirmDestructiveOptions): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }

    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** A plain message with one OK button; `window.alert` on web, like `confirmDestructive`. */
export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
