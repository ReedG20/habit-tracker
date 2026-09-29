import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Add01Icon, SparklesIcon, Tick02Icon } from '@/constants/icons';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/lib/haptics';

export type ProofIdeasProps = {
  /** `null` while the name is still being checked. */
  ideas: string[] | null;
  /** What the proof field says now, so a picked idea shows as picked until it's edited. */
  current: string;
  /** Puts the idea in the proof field, to use as is or edit. */
  onPick: (idea: string) => void;
};

/**
 * Proof descriptions written for this name and method by the name check, so
 * nobody has to start from a blank box. Picking one fills the field; it can
 * be edited from there.
 */
export function ProofIdeas({ ideas, current, onPick }: ProofIdeasProps) {
  const theme = useTheme();
  if (ideas !== null && ideas.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Icon icon={SparklesIcon} size={18} strokeWidth={2} themeColor="textSecondary" />
        <ThemedText type="small" themeColor="textSecondary">
          {ideas === null ? 'Writing a few ideas…' : 'Or start from one of these'}
        </ThemedText>
      </View>
      {ideas === null
        ? [0, 1, 2].map((index) => <Placeholder key={index} />)
        : ideas.map((idea) => {
            const picked = idea === current.trim();
            return (
              <Animated.View key={idea} entering={FadeIn.duration(200)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use this proof: ${idea}`}
                  accessibilityState={{ selected: picked }}
                  onPress={() => {
                    selectionHaptic();
                    onPick(idea);
                  }}
                  style={({ pressed }) => [
                    styles.idea,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: picked ? theme.primary : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="small" themeColor="text" style={styles.ideaText}>
                    {idea}
                  </ThemedText>
                  <Icon
                    icon={picked ? Tick02Icon : Add01Icon}
                    size={20}
                    strokeWidth={2}
                    themeColor={picked ? 'primary' : 'textSecondary'}
                  />
                </Pressable>
              </Animated.View>
            );
          })}
    </View>
  );
}

/** A row's outline while the ideas are on their way. */
function Placeholder() {
  const theme = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.idea, styles.placeholder, { backgroundColor: theme.backgroundElement }, style]}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  idea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ideaText: {
    flex: 1,
  },
  // About one line of text tall.
  placeholder: {
    height: 44,
  },
  pressed: {
    opacity: 0.7,
  },
});
