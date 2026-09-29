import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  PROOF_METHOD_ORDER,
  PROOF_METHODS,
  TIMER_MINUTES,
  formatMinutes,
  type ProofMethod,
} from '@/constants/proof-methods';
import { BorderRadius, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/lib/haptics';

export type ProofMethodPickerProps = {
  value: ProofMethod;
  onChange: (method: ProofMethod) => void;
  timerMinutes: number;
  onTimerMinutesChange: (minutes: number) => void;
  /** The method the name check thinks suits this habit best, badged on its card. */
  bestMethod?: ProofMethod | null;
};

/**
 * How a habit is proved; a timer also picks its length. Fixed once the habit
 * is made, so under the cards the chosen method spells out what it will ask.
 */
export function ProofMethodPicker({
  value,
  onChange,
  timerMinutes,
  onTimerMinutesChange,
  bestMethod,
}: ProofMethodPickerProps) {
  const theme = useTheme();

  return (
    <Animated.View style={styles.field} layout={LinearTransition.duration(220)}>
      <View style={styles.row} accessibilityRole="radiogroup">
        {PROOF_METHOD_ORDER.map((key) => {
          const method = PROOF_METHODS[key];
          const selected = key === value;
          const best = key === bestMethod;

          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={`${method.label}, ${method.hint}${best ? ', best fit' : ''}`}
              accessibilityState={{ selected }}
              onPress={() => {
                if (selected) return;
                selectionHaptic();
                onChange(key);
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: selected ? theme.primary : 'transparent',
                },
                pressed && styles.pressed,
              ]}>
              <View style={styles.labelRow}>
                <Icon
                  icon={method.icon}
                  size={20}
                  strokeWidth={2}
                  themeColor={selected ? 'primary' : 'textSecondary'}
                />
                <ThemedText type="smallBold" themeColor="text" numberOfLines={1}>
                  {method.label}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {method.hint}
              </ThemedText>
              {best ? (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={[styles.badge, { backgroundColor: theme.primary }]}>
                  <ThemedText style={[styles.badgeText, { color: theme.onPrimary }]}>
                    Best fit
                  </ThemedText>
                </Animated.View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {value === 'timer' ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lengths}
            accessibilityRole="radiogroup"
            accessibilityLabel="Timer length">
            {TIMER_MINUTES.map((minutes) => {
              const selected = minutes === timerMinutes;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    selectionHaptic();
                    onTimerMinutesChange(minutes);
                  }}
                  style={({ pressed }) => [
                    styles.length,
                    {
                      backgroundColor: selected ? theme.primary : theme.backgroundElement,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText
                    type="smallSemibold"
                    style={{ color: selected ? theme.onPrimary : theme.text }}>
                    {formatMinutes(minutes)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : null}

      <Animated.View
        key={value}
        entering={FadeIn.duration(200)}
        style={[styles.how, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold" themeColor="text">
          How {PROOF_METHODS[value].label.toLowerCase()} proof works
        </ThemedText>
        {PROOF_METHODS[value].howItWorks.map((line, index) => (
          <View key={line} style={styles.howLine}>
            <View style={[styles.howNumber, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.howNumberText} themeColor="textSecondary">
                {index + 1}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.howText}>
              {line}
            </ThemedText>
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Icon beside the label, so the row stays short enough for the step to fit one screen.
  card: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: BorderRadius,
    borderWidth: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  lengths: {
    gap: Spacing.two,
  },
  length: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
  },
  // Sits on the card's top edge, so the card keeps its height.
  badge: {
    position: 'absolute',
    top: -10,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: PillRadius,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 700,
  },
  how: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: BorderRadius,
  },
  howLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  // Centred on the first line of its text.
  howNumber: {
    width: 20,
    height: 20,
    marginTop: 0,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howNumberText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
  },
  howText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
