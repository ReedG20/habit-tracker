import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';

import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayKey, fromDayKey, toDayKey } from '@/lib/dates';

export type DayFieldProps = {
  /** A `YYYY-MM-DD` day key. */
  value: string;
  onChange: (day: string) => void;
  label: string;
  /** The earliest and latest days that can be picked. */
  min: string;
  max: string;
};

/**
 * Android and web fallback for picking a day, no time. Android opens the
 * system date dialog; web takes a `YYYY-MM-DD` string.
 */
export function DayField({ value, onChange, label, min, max }: DayFieldProps) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>

      {Platform.OS === 'web' ? (
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (/^\d{4}-\d{2}-\d{2}$/.test(text) && text >= min && text <= max) onChange(text);
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : picking ? (
        <DateTimePicker
          value={fromDayKey(value)}
          mode="date"
          display="default"
          minimumDate={fromDayKey(min)}
          maximumDate={fromDayKey(max)}
          accentColor={theme.primary}
          onValueChange={(_event, date) => {
            onChange(toDayKey(date));
            setPicking(false);
          }}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPicking(true)}
          hitSlop={Spacing.two}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="smallBold" themeColor="text">
            {formatDayKey(value)}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 44,
  },
  label: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    borderRadius: PillRadius,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
});
