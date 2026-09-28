import { Pressable, type ViewProps } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

/**
 * Dismisses the keyboard on a tap anywhere in it that no button inside
 * claims. For chrome outside a scroll view, like a screen's header: a
 * `KeyboardScrollView` already does this for its own content.
 */
export function DismissKeyboardArea(props: ViewProps) {
  return (
    <Pressable accessible={false} onPress={() => void KeyboardController.dismiss()} {...props} />
  );
}
