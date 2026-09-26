import { Host, Toggle } from '@expo/ui/swift-ui';
import { accessibilityLabel, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';

import type { SwitchProps } from './switch.types';

import { useTheme } from '@/hooks/use-theme';

/** The system switch, which picks up liquid glass on iOS 26. */
export function Switch({ value, onChange, accessibilityLabel: label }: SwitchProps) {
  const theme = useTheme();

  return (
    <Host matchContents>
      <Toggle
        isOn={value}
        onIsOnChange={onChange}
        modifiers={[labelsHidden(), tint(theme.primary), accessibilityLabel(label)]}
      />
    </Host>
  );
}
