import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Note } from './note';

import { Icon } from '@/components/icon';
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS } from '@/components/stake-picker';
import { ThemedText } from '@/components/themed-text';
import { Add01Icon, MinusSignIcon } from '@/constants/icons';
import { Fonts, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/lib/money';

const PRESETS_CENTS = [500, 1000, 2500, 5000];
const STEP_CENTS = 100;

/** What the amount feels like, so the number lands as money rather than a setting. */
export function describeStake(amountCents: number): string {
  if (amountCents < 1000) return 'lunch money. you will notice.';
  if (amountCents < 2500) return 'a night out. this one stings.';
  if (amountCents < MAX_STAKE_CENTS) return 'real money. now you move.';
  return 'serious. make sure the goal is doable.';
}

export type StakeAmountPickerProps = {
  amountCents: number;
  onChange: (amountCents: number) => void;
  disabled?: boolean;
};

/** The forfeit as one big number, with ± steppers and the common amounts under it. */
export function StakeAmountPicker({
  amountCents,
  onChange,
  disabled = false,
}: StakeAmountPickerProps) {
  const theme = useTheme();

  const set = (next: number) => {
    const clamped = Math.min(MAX_STAKE_CENTS, Math.max(MIN_STAKE_CENTS, next));
    if (clamped === amountCents) return;
    void Haptics.selectionAsync();
    onChange(clamped);
  };

  const stepper = (delta: number) => {
    const atLimit = delta < 0 ? amountCents <= MIN_STAKE_CENTS : amountCents >= MAX_STAKE_CENTS;

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          delta < 0 ? 'Lower the stake by one dollar' : 'Raise the stake by one dollar'
        }
        disabled={disabled || atLimit}
        onPress={() => set(amountCents + delta)}
        hitSlop={Spacing.two}
        style={({ pressed }) => [
          styles.stepButton,
          { backgroundColor: theme.backgroundElement },
          (pressed || atLimit) && styles.dimmed,
        ]}>
        <Icon icon={delta < 0 ? MinusSignIcon : Add01Icon} size={22} themeColor="text" />
      </Pressable>
    );
  };

  return (
    <View style={styles.picker}>
      <View style={styles.amountRow}>
        {stepper(-STEP_CENTS)}
        <ThemedText
          style={styles.amount}
          themeColor="text"
          accessibilityRole="adjustable"
          accessibilityLabel={`Stake ${formatCents(amountCents)}`}>
          {formatCents(amountCents)}
        </ThemedText>
        {stepper(STEP_CENTS)}
      </View>

      <Note style={styles.note}>{describeStake(amountCents)}</Note>

      <View style={styles.chips}>
        {PRESETS_CENTS.map((cents) => {
          const selected = cents === amountCents;

          return (
            <Pressable
              key={cents}
              accessibilityRole="button"
              accessibilityLabel={`Stake ${formatCents(cents)}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => set(cents)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? theme.primary : theme.backgroundElement,
                },
                pressed && styles.dimmed,
              ]}>
              <ThemedText
                type="smallSemibold"
                style={{ color: selected ? theme.onPrimary : theme.text }}>
                {formatCents(cents)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  // Comico sits high in its line box: a tall box keeps the digits from clipping.
  amount: {
    fontFamily: Fonts.wisdom,
    fontSize: 80,
    lineHeight: 104,
    minWidth: 170,
    textAlign: 'center',
  },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
  },
  dimmed: {
    opacity: 0.4,
  },
});
