import { Button, HStack, Host, RNHostView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

import type { ActionButtonProps } from './action-button.types';
import { Icon } from './icon';

import { useTheme } from '@/hooks/use-theme';

/**
 * A real SwiftUI button, so it gets the system's liquid glass on iOS 26 (and
 * the bordered look before that). The label is built by hand so the icon can
 * be the same HugeIcons glyph as everywhere else, hosted back inside SwiftUI.
 *
 * Never put one in a sheet that also has an RN `TextInput`: the SwiftUI host
 * steals first responder from it. Those sheets use `GlassButton` instead.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'neutral',
  size = 'regular',
  icon,
  fill = false,
  disabled = false,
  accessibilityLabel,
  style,
}: ActionButtonProps) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();
  const prominent = variant === 'primary';

  const textColor = prominent
    ? theme.onPrimary
    : variant === 'destructive'
      ? theme.accent
      : theme.text;

  return (
    <Host matchContents={fill ? { vertical: true } : true} style={style}>
      <Button
        role={variant === 'destructive' ? 'destructive' : 'default'}
        onPress={onPress}
        modifiers={[
          buttonStyle(
            glass
              ? prominent
                ? 'glassProminent'
                : 'glass'
              : prominent
                ? 'borderedProminent'
                : 'bordered',
          ),
          controlSize(size === 'small' ? 'regular' : 'large'),
          tint(prominent ? theme.primary : textColor),
          disabledModifier(disabled),
          accessibilityLabelModifier(accessibilityLabel ?? label),
        ]}>
        {/* The glass wraps the label, so the label is what stretches. SwiftUI
            has no "infinite" over the bridge; a large cap fills the host. */}
        <HStack
          spacing={6}
          alignment="center"
          modifiers={fill ? [frame({ maxWidth: 100_000 })] : undefined}>
          {icon ? (
            <RNHostView matchContents>
              <Icon icon={icon} size={size === 'small' ? 18 : 20} color={textColor} />
            </RNHostView>
          ) : null}
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(textColor)]}>
            {label}
          </Text>
        </HStack>
      </Button>
    </Host>
  );
}
