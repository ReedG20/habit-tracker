import { Pressable, StyleSheet } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { CommitmentKind } from './draft';
import { openIconPicker } from './icon-picker';

import { Icon } from '@/components/icon';
import { commitmentIcon } from '@/constants/commitment-icons';
import { ActionCardRadius, ControlHeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconTileProps = {
  kind: CommitmentKind;
  /** The icon shown; `null` shows the kind's default until one is picked. */
  icon: string | null;
  /** The name check's pick for the current name, offered first in the picker. */
  suggested: string | null;
  /** Dimmed while the name is out being checked and nothing is shown yet. */
  pending?: boolean;
  /** A key picked by hand, or `null` to go back to the suggestion. */
  onPick: (icon: string | null) => void;
};

/**
 * The commitment's icon beside its name, the same tile the cards show. The
 * name check fills it in as the name is typed; a tap opens the picker.
 */
export function IconTile({ kind, icon, suggested, pending = false, onPick }: IconTileProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Change icon"
      onPress={() => {
        // The sheet is glass: a keyboard left up behind it shows through.
        void KeyboardController.dismiss();
        openIconPicker({ kind, selected: icon, suggested, onPick });
      }}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      {/* Keyed, so each new pick fades in rather than swapping hard. */}
      <Animated.View key={icon ?? kind} entering={FadeIn.duration(220)}>
        <Icon
          icon={commitmentIcon(icon, kind)}
          size={26}
          strokeWidth={2}
          themeColor={icon === null || pending ? 'textSecondary' : 'text'}
          style={pending ? styles.pending : undefined}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same size and corner as the cards' icon tiles.
  tile: {
    width: ControlHeight,
    height: ControlHeight,
    borderRadius: ActionCardRadius - Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  pending: {
    opacity: 0.5,
  },
});
