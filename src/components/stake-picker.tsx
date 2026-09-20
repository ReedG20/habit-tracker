import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Add01Icon, MinusSignIcon } from '@/constants/icons';
import { BorderRadius, Fonts, PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/lib/money';

export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 5000;

const PRESETS_CENTS = [500, 1000, 2500, 5000];
const STEP_CENTS = 100;

export type StakePickerProps = {
  /** `null` means no money on the goal. */
  amountCents: number | null;
  onChange: (amountCents: number | null) => void;
  disabled?: boolean;
};

/**
 * Presets for the common amounts and a stepper for anything in between. The
 * copy under it doubles as the disclosure Stripe requires before saving a card
 * for off-session use, so it stays next to the amount.
 */
export function StakePicker({ amountCents, onChange, disabled = false }: StakePickerProps) {
  const theme = useTheme();

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    accessibilityLabel?: string,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallSemibold" style={{ color: selected ? theme.onPrimary : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const step = (delta: number) => {
    const next = Math.min(MAX_STAKE_CENTS, Math.max(MIN_STAKE_CENTS, (amountCents ?? 0) + delta));
    onChange(next);
  };

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Stake
      </ThemedText>

      <View style={styles.chips}>
        {chip('No stake', amountCents === null, () => onChange(null))}
        {PRESETS_CENTS.map((cents) =>
          chip(
            formatCents(cents),
            amountCents === cents,
            () => onChange(cents),
            `Stake ${formatCents(cents)}`,
          ),
        )}
      </View>

      {amountCents !== null ? (
        <View style={[styles.stepper, { backgroundColor: theme.backgroundElement }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lower the stake by one dollar"
            disabled={disabled || amountCents <= MIN_STAKE_CENTS}
            onPress={() => step(-STEP_CENTS)}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
            <Icon
              icon={MinusSignIcon}
              size={20}
              themeColor={amountCents <= MIN_STAKE_CENTS ? 'textSecondary' : 'text'}
            />
          </Pressable>
          <ThemedText style={styles.amount} themeColor="text">
            {formatCents(amountCents)}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Raise the stake by one dollar"
            disabled={disabled || amountCents >= MAX_STAKE_CENTS}
            onPress={() => step(STEP_CENTS)}
            hitSlop={Spacing.two}
            style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}>
            <Icon
              icon={Add01Icon}
              size={20}
              themeColor={amountCents >= MAX_STAKE_CENTS ? 'textSecondary' : 'text'}
            />
          </Pressable>
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        {amountCents === null
          ? 'Putting money on it makes it real: miss the deadline and your card is charged. Complete it and nothing happens.'
          : `Miss the deadline and your card is charged ${formatCents(amountCents)}. Complete it and nothing happens. Your card is saved for this.`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
    borderWidth: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius,
    paddingHorizontal: Spacing.two,
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Comico sits high in its line box: a tall box keeps the digits from clipping.
  amount: {
    fontFamily: Fonts.wisdom,
    fontSize: 32,
    lineHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
});
