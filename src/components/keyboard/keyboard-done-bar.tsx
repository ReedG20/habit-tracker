import { Pressable, StyleSheet, View } from 'react-native';
import { KeyboardController, KeyboardStickyView } from 'react-native-keyboard-controller';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const BUTTON_HEIGHT = 36;
const GAP = Spacing.two;

/**
 * How far above the keyboard a focused field has to stay to clear the Done
 * bar, with a little air. `KeyboardScrollView` scrolls fields to this.
 */
export const DONE_BAR_CLEARANCE = BUTTON_HEIGHT + GAP + Spacing.three;

/**
 * A Done capsule riding on the keyboard's trailing edge: the one way out of a
 * multiline field, whose Return key adds a line instead of leaving.
 *
 * Solid with a shadow rather than glass, because it floats over whatever the
 * form is showing, and glass over plain text reads as a stray word. An RN
 * button on purpose: a SwiftUI host would take first responder from the very
 * field it's meant to close. Render it last in a screen's root view, which
 * has to reach the bottom of the screen.
 */
export function KeyboardDoneBar() {
  const theme = useTheme();

  return (
    <KeyboardStickyView
      // Parked below the screen while the keyboard is down.
      offset={{ closed: BUTTON_HEIGHT + GAP, opened: -GAP }}
      style={styles.sticky}
      pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide keyboard"
          onPress={() => void KeyboardController.dismiss()}
          hitSlop={Spacing.two}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.background, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallSemibold" themeColor="text">
            Done
          </ThemedText>
        </Pressable>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
  },
  button: {
    height: BUTTON_HEIGHT,
    paddingHorizontal: Spacing.three,
    borderRadius: BUTTON_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: {
    opacity: 0.72,
  },
});
