import { Pressable, StyleSheet, View } from 'react-native';

import { draftEndDay, type CommitmentDraft } from '@/components/commitment/draft';
import { DayField } from '@/components/day-field';
import { SegmentedPicker } from '@/components/segmented-picker';
import { ThemedText } from '@/components/themed-text';
import { PillRadius, Spacing } from '@/constants/theme';
import {
  END_DATE_PRESET_WEEKS,
  endDayAfterWeeks,
  MAX_END_DATE_WEEKS,
  MIN_END_DATE_WEEKS,
} from '@/convex/lib/endDate';
import { formatLastDay } from '@/data/ending';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/dates';

type EndValue = 'none' | 'date';

const options: { value: EndValue; label: string }[] = [
  { value: 'none', label: 'No end date' },
  { value: 'date', label: 'End date' },
];

/** What a new end date starts at when it's switched on. */
const DEFAULT_WEEKS = 4;

export type EndDatePickerProps = {
  draft: Pick<CommitmentDraft, 'kind' | 'endsOn' | 'timesPerWeek' | 'startDay'>;
  onChange: (endsOn: string | undefined) => void;
};

/**
 * Whether a habit runs until it's ended (the default) or through a set date
 * (`convex/lib/endDate.ts`), with the difference spelled out under the
 * control: ending one takes a week's notice, the other just finishes.
 */
export function EndDatePicker({ draft, onChange }: EndDatePickerProps) {
  const today = todayKey();
  const habit = { timesPerWeek: draft.timesPerWeek, startDay: today };
  const endDay = draftEndDay(draft, today);

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        For how long?
      </ThemedText>
      <SegmentedPicker
        options={options}
        value={endDay === undefined ? 'none' : 'date'}
        onChange={(next) =>
          onChange(next === 'none' ? undefined : endDayAfterWeeks(habit, DEFAULT_WEEKS))
        }
      />

      {endDay === undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          It keeps going until you end it, and ending it takes a week’s notice: it still counts
          until then.
        </ThemedText>
      ) : (
        <>
          <DayField
            label="Last day"
            value={endDay}
            min={endDayAfterWeeks(habit, MIN_END_DATE_WEEKS)}
            max={endDayAfterWeeks(habit, MAX_END_DATE_WEEKS)}
            onChange={onChange}
          />
          <EndDatePresets habit={habit} value={endDay} onChange={onChange} />
          <ThemedText type="small" themeColor="textSecondary">
            {`It counts through ${formatLastDay(endDay)}, then it’s done and counts as kept. Start it again after if you like. Ending it sooner still takes a week’s notice.`}
          </ThemedText>
        </>
      )}
    </View>
  );
}

/**
 * "2 / 4 / 8 / 12 weeks" under the date, as one row of equal pills, like the
 * goal deadline's presets. The pill matching the picked day stays lit.
 */
function EndDatePresets({
  habit,
  value,
  onChange,
}: {
  habit: { timesPerWeek: number; startDay: string };
  value: string;
  onChange: (endsOn: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.presets}>
      {END_DATE_PRESET_WEEKS.map((weeks) => {
        const day = endDayAfterWeeks(habit, weeks);
        const selected = value === day;
        return (
          <Pressable
            key={weeks}
            accessibilityRole="button"
            accessibilityLabel={`Ends after ${weeks} weeks`}
            accessibilityState={{ selected }}
            onPress={() => onChange(day)}
            style={({ pressed }) => [
              styles.preset,
              { backgroundColor: selected ? theme.primary : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallSemibold"
              style={{ color: selected ? theme.onPrimary : theme.text }}>
              {weeks} weeks
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shorter than a full control: these are shortcuts under the picker, not the picker. */
const PRESET_HEIGHT = 36;

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  presets: {
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
