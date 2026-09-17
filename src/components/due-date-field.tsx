import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from './themed-text';

import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayKey, fromDayKey, toDayKey } from '@/lib/dates';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DueDateFieldProps = {
  dueDay: string | undefined;
  onChange: (dueDay: string | undefined) => void;
};

/**
 * Keep the SwiftUI picker unmounted while typing. `@expo/ui`'s DateTimePicker
 * uses a SwiftUI `Host`, which steals first responder from RN `TextInput`s in
 * the same sheet.
 */
export function DueDateField({ dueDay, onChange }: DueDateFieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(dueDay ?? '');
  const [picking, setPicking] = useState(false);
  const value = dueDay ? fromDayKey(dueDay) : new Date();

  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
          Due date
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
              const trimmed = text.trim();
              if (trimmed.length === 0) {
                onChange(undefined);
                return;
              }
              if (DAY_PATTERN.test(trimmed)) {
                onChange(trimmed);
              }
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : picking ? (
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            presentation="inline"
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
            <ThemedText type="smallBold" themeColor={dueDay ? 'text' : 'textSecondary'}>
              {dueDay ? formatDayKey(dueDay) : 'Add'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      {dueDay && Platform.OS !== 'web' && !picking ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraft('');
            onChange(undefined);
          }}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            Clear
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
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
    borderRadius: BorderRadius,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
    textAlign: 'right',
  },
  clear: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.7,
  },
});
