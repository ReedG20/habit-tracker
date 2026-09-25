import type { IconSvgElement } from '@hugeicons/react-native';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { PillRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconSvgElement;
};

/** A toggleable pill, styled like the stake picker's preset chips. */
export function ChoiceChip({ label, selected, onPress, icon }: ChoiceChipProps) {
  const theme = useTheme();
  const color = selected ? theme.onPrimary : theme.text;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      {icon !== undefined ? <Icon icon={icon} size={18} color={color} /> : null}
      <ThemedText type="smallSemibold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
    borderRadius: PillRadius,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
