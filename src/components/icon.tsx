import { HugeiconsIcon, type HugeiconsProps } from '@hugeicons/react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconProps = Omit<HugeiconsProps, 'color'> & {
  color?: string;
  themeColor?: ThemeColor;
};

export function Icon({ size = 20, strokeWidth = 1.5, color, themeColor, ...rest }: IconProps) {
  const theme = useTheme();

  return (
    <HugeiconsIcon
      size={size}
      strokeWidth={strokeWidth}
      color={color ?? theme[themeColor ?? 'text']}
      {...rest}
    />
  );
}
