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

/** The rule under the cards, so each method says what it asks of you. */
const rules: Record<ProofMethod, string> = {
  photo: 'Snap it in the app. AI checks it against what you write below.',
  location: 'Check in when you get there. Ante matches the places around you.',
  timer: 'Keep Ante open until the timer runs out. Leaving stops it.',
};

export type ProofMethodPickerProps = {
  value: ProofMethod;
  onChange: (method: ProofMethod) => void;
  timerMinutes: number;
  onTimerMinutesChange: (minutes: number) => void;
};

/** How a habit is proved; a timer also picks its length. Fixed once the habit is made. */
export function ProofMethodPicker({
  value,
  onChange,
  timerMinutes,
  onTimerMinutesChange,
}: ProofMethodPickerProps) {
  const theme = useTheme();

  return (
    <Animated.View style={styles.field} layout={LinearTransition.duration(220)}>
      <ThemedText type="small" themeColor="textSecondary">
        How will you prove it?
      </ThemedText>
      <View style={styles.row} accessibilityRole="radiogroup">
        {PROOF_METHOD_ORDER.map((key) => {
          const method = PROOF_METHODS[key];
          const selected = key === value;

          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={`${method.label}, ${method.hint}`}
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

      <ThemedText type="small" themeColor="textSecondary">
        {rules[value]}
      </ThemedText>
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
  pressed: {
    opacity: 0.7,
  },
});
