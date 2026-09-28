import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Ref,
  type RefObject,
} from 'react';
import {
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type View,
} from 'react-native';
import {
  KeyboardController,
  KeyboardEvents,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { DONE_BAR_CLEARANCE } from './keyboard-done-bar';

import { Spacing } from '@/constants/theme';

export type KeyboardScrollViewProps = ScrollViewProps & {
  ref?: Ref<ScrollView>;
  /**
   * Height of anything pinned below the scroll view (a footer of actions).
   * The keyboard covers it too, so it comes off the space the keyboard adds.
   */
  bottomInset?: number;
};

type FieldFocus = {
  focus: (field: View) => void;
  blur: (field: View) => void;
};

const FieldFocusContext = createContext<FieldFocus | null>(null);

/**
 * The scroll view every screen with a text field goes through, so the keyboard
 * behaves the same everywhere: the focused field scrolls clear of the keyboard
 * and the Done bar, and a tap on the background or a drag down dismisses it.
 *
 * Hand-rolled rather than keyboard-controller's `KeyboardAwareScrollView`: that
 * one tells inputs apart by their superview's tag, and every SwiftUI field has
 * the same one, so moving between fields with the keyboard up raced it to a
 * stale position. Fields report focus here instead (see `useFieldFocus`), and
 * only a field the keyboard actually hides is scrolled.
 */
export function KeyboardScrollView({
  bottomInset = 0,
  ref,
  onScroll,
  children,
  ...rest
}: KeyboardScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const offsetY = useRef(0);
  const focused = useRef<View | null>(null);
  const window = useWindowDimensions();

  // Room to scroll a low field above the keyboard: grows with it, frame by frame.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const spacer = useAnimatedStyle(() => ({
    height: Math.max(0, -keyboardHeight.value - bottomInset),
  }));

  const setRefs = useCallback(
    (instance: ScrollView | null) => {
      scrollRef.current = instance;
      if (typeof ref === 'function') ref(instance);
      else if (ref) ref.current = instance;
    },
    [ref],
  );

  // Worked out in content coordinates, so the same field always lands on the
  // same offset: a second call (iOS can report the keyboard twice) is a no-op
  // rather than another push, and a field already in view never moves.
  const reveal = useCallback(
    (field: View, keyboardHeight: number) => {
      const scrollView = scrollRef.current;
      const scrollNode = scrollView?.getNativeScrollRef();
      const content = contentRef.current;
      if (!scrollNode || !content) return;
      const visibleBottom = window.height - keyboardHeight - DONE_BAR_CLEARANCE;

      scrollNode.measureInWindow((_sx, scrollTop) => {
        field.measureLayout(content, (_x, top, _width, height) => {
          const visibleHeight = visibleBottom - scrollTop;
          // Bottom edge just clear of the keyboard, but never past the top
          // edge (and label), which is where typing starts in a tall field.
          const target = Math.min(top + height - visibleHeight, top - Spacing.three);
          if (target <= offsetY.current) return;
          scrollView?.scrollTo({ y: target, animated: true });
        });
      });
    },
    [window.height],
  );

  // Moving between fields: the keyboard is already up, so reveal right away.
  // Otherwise wait for it to finish opening, when the spacer has room to give.
  const fieldFocus = useMemo<FieldFocus>(
    () => ({
      focus: (field) => {
        focused.current = field;
        if (KeyboardController.isVisible()) reveal(field, KeyboardController.state().height);
      },
      blur: (field) => {
        if (focused.current === field) focused.current = null;
      },
    }),
    [reveal],
  );

  useEffect(() => {
    const subscription = KeyboardEvents.addListener('keyboardDidShow', (event) => {
      if (focused.current) reveal(focused.current, event.height);
    });
    return () => subscription.remove();
  }, [reveal]);

  const trackScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    },
    [onScroll],
  );

  return (
    <FieldFocusContext.Provider value={fieldFocus}>
      <ScrollView
        ref={setRefs}
        // RN's type wants a never-null ref object; it's null only before mount.
        innerViewRef={contentRef as RefObject<View>}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onScroll={trackScroll}
        {...rest}>
        {children}
        <Animated.View style={spacer} />
      </ScrollView>
    </FieldFocusContext.Provider>
  );
}

const noop: FieldFocus = { focus: () => {}, blur: () => {} };

/**
 * For a text field to report its outer view's focus changes, so the enclosing
 * `KeyboardScrollView` can keep it above the keyboard. A no-op outside one.
 */
export function useFieldFocus(): FieldFocus {
  return useContext(FieldFocusContext) ?? noop;
}
