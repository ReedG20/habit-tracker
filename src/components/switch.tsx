import { Switch as NativeSwitch } from 'react-native';

import type { SwitchProps } from './switch.types';

import { useTheme } from '@/hooks/use-theme';

/** Android and web fallback for the SwiftUI switch. */
export function Switch({ value, onChange, accessibilityLabel }: SwitchProps) {
  const theme = useTheme();

  return (
    <NativeSwitch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ true: theme.primary }}
    />
  );
}
