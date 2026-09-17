import { Pressable, StyleSheet } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Add01Icon } from '@/constants/icons';
import { Spacing } from '@/constants/theme';

export type HeaderAddButtonProps = {
  label: string;
  onPress: () => void;
};

/** Compact text+icon control that sits under a screen heading. */
export function HeaderAddButton({ label, onPress }: HeaderAddButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon icon={Add01Icon} size={16} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
