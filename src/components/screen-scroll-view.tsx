import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardScrollView, type KeyboardScrollViewProps } from './keyboard/keyboard-scroll-view';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The safe area goes on the content as padding rather than as `contentInset`:
 * a native `contentInset` is not reliably reapplied when a screen swaps its
 * loading scroll view for the real one (the pushed screen also renders once
 * with zero insets), which left content under the status bar. Padding is
 * plain layout, so it always lands.
 *
 * Keyboard-aware, so a screen that grows a text field gets the same keyboard
 * handling as the forms without doing anything.
 */
export function ScreenScrollView({ contentContainerStyle, ...rest }: KeyboardScrollViewProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
    default: {
      paddingTop: insets.top,
      paddingLeft: Spacing.three + insets.left,
      paddingRight: Spacing.three + insets.right,
      paddingBottom: insets.bottom,
    },
  });

  return (
    <KeyboardScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle, contentContainerStyle]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
});
