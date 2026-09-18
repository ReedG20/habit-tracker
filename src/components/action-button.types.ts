import type { IconSvgElement } from '@hugeicons/react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export type ActionButtonVariant = 'neutral' | 'primary' | 'destructive';

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** `small` fits inside a card row; `regular` is a full-height sheet or header button. */
  size?: 'small' | 'regular';
  icon?: IconSvgElement;
  /** Stretch to the full width the parent gives it (the submit button in a sheet). */
  fill?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};
