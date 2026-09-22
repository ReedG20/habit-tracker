import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';

import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDueAt } from '@/lib/dates';

export type DeadlineFieldProps = {
  /** Timestamp in ms. Always set: a goal cannot exist without a deadline. */
  value: number;
  onChange: (value: number) => void;
  label?: string;
};

/**
 * Android and web fallback. Android picks the date and the time in two steps;
 * web takes an ISO-like `YYYY-MM-DDTHH:MM` string.
 */
export function DeadlineField({ value, onChange, label = 'Deadline' }: DeadlineFieldProps) {
  const theme = useTheme();
  const [step, setStep] = useState<'idle' | 'date' | 'time'>('idle');
  const [draft, setDraft] = useState(() => toLocalInput(value));

  return (
    <View style={styles.field}>
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
              const parsed = new Date(text).getTime();
              if (!Number.isNaN(parsed)) onChange(parsed);
            }}
            placeholder="YYYY-MM-DDTHH:MM"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : step !== 'idle' ? (
          <DateTimePicker
            value={new Date(value)}
            mode={step}
            display="default"
            accentColor={theme.primary}
            onValueChange={(_event, date) => {
              onChange(date.getTime());
              setStep(step === 'date' ? 'time' : 'idle');
            }}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('date')}
            hitSlop={Spacing.two}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="smallBold" themeColor="text">
              {formatDueAt(value)}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function toLocalInput(value: number): string {
  const date = new Date(value);
  const pad = (n: number) => n.toString().padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
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
