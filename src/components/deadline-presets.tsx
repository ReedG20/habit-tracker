import { Pressable, StyleSheet, View } from 'react-native';

import { daysUntil, dueInDays } from '@/components/commitment/draft';
import { ThemedText } from '@/components/themed-text';
import { PillRadius, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

const PRESET_DAYS = [7, 14, 20, 30] as const;

/** Shorter than a full control: these are shortcuts under the picker, not the picker. */
const PRESET_HEIGHT = 36;

export type DeadlinePresetsProps = {
  value: number;
  onChange: (dueAt: number) => void;
};

/**
 * "7 / 14 / 20 / 30 days" under the deadline picker, as one row of equal
 * pills. A tap moves the date and keeps the time; the pill matching the
 * picked day stays lit.
 */
export function DeadlinePresets({ value, onChange }: DeadlinePresetsProps) {
  const theme = useTheme();
  const current = daysUntil(value, useNow());

  return (
    <View style={styles.row}>
      {PRESET_DAYS.map((days) => {
        const selected = current === days;
        return (
          <Pressable
            key={days}
            accessibilityRole="button"
            accessibilityLabel={`Deadline in ${days} days`}
            accessibilityState={{ selected }}
            onPress={() => onChange(dueInDays(days, value))}
            style={({ pressed }) => [
              styles.preset,
              { backgroundColor: selected ? theme.primary : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallSemibold"
              style={{ color: selected ? theme.onPrimary : theme.text }}>
              {days} days
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  preset: {
    flex: 1,
    height: PRESET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: PillRadius,
  },
  pressed: {
    opacity: 0.7,
  },
});
