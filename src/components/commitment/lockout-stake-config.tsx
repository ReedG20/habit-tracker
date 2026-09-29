import { StyleSheet, View } from 'react-native';

import { lockoutLabel, type CommitmentDraft } from './draft';

import { Icon } from '@/components/icon';
import { SegmentedPicker } from '@/components/segmented-picker';
import { ThemedText } from '@/components/themed-text';
import { Cancel01Icon, LockIcon, Tick02Icon } from '@/constants/icons';
import { PillRadius, Spacing } from '@/constants/theme';
import { isLockoutDays, LOCKOUT_DAYS, type LockoutDays } from '@/convex/lib/stakeRules';
import { useTheme } from '@/hooks/use-theme';

type DayState = 'done' | 'missed' | 'frozen' | 'back';

/** A week that goes: done, done, a miss, then frozen for the chosen days, then back. */
function strip(days: LockoutDays): DayState[] {
  const frozen = Math.min(days, 4);
  const states: DayState[] = ['done', 'done', 'missed'];
  for (let index = 0; index < frozen; index += 1) states.push('frozen');
  while (states.length < 7) states.push('back');
  return states;
}

const dayInitial = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

export type LockoutStakeConfigProps = {
  draft: CommitmentDraft;
  onChange: (patch: Partial<CommitmentDraft>) => void;
};

/** How long a miss freezes every habit, with a week drawn out to show it. */
export function LockoutStakeConfig({ draft, onChange }: LockoutStakeConfigProps) {
  const theme = useTheme();
  const states = strip(draft.lockoutDays);
  const today = new Date();

  return (
    <View style={styles.config}>
      <SegmentedPicker
        options={LOCKOUT_DAYS.map((days) => ({
          value: String(days),
          label: days === 7 ? '1 week' : lockoutLabel(days),
        }))}
        value={String(draft.lockoutDays)}
        onChange={(value) => {
          const days = Number(value);
          if (isLockoutDays(days)) onChange({ lockoutDays: days });
        }}
      />

      <View
        style={styles.week}
        accessible
        accessibilityLabel={`Two days done, one missed, then every habit frozen for ${lockoutLabel(draft.lockoutDays)}`}>
        {states.map((state, index) => {
          const day = new Date(today);
          day.setDate(today.getDate() + index);
          return (
            <View key={index} style={styles.day}>
              <View
                style={[
                  styles.dot,
                  state === 'done' && { backgroundColor: theme.primary },
                  state === 'missed' && { backgroundColor: theme.accent },
                  state === 'frozen' && {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                  state === 'back' && { backgroundColor: theme.backgroundElement },
                ]}>
                {state === 'back' ? null : (
                  <Icon
                    icon={
                      state === 'done' ? Tick02Icon : state === 'missed' ? Cancel01Icon : LockIcon
                    }
                    size={state === 'frozen' ? 16 : 18}
                    strokeWidth={state === 'frozen' ? 1.75 : 2.5}
                    color={state === 'frozen' ? theme.textSecondary : theme.onPrimary}
                  />
                )}
              </View>
              <ThemedText type="small" themeColor={state === 'missed' ? 'accent' : 'textSecondary'}>
                {dayInitial.format(day)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  config: {
    gap: Spacing.three,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  day: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 38,
    height: 38,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
