import { StyleSheet, View } from 'react-native';

import type { CommitmentKind } from './draft';
import { IconTile } from './icon-tile';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export type IconFieldProps = {
  kind: CommitmentKind;
  icon: string | null;
  /** Whether the user picked it, rather than it following the name. */
  chosen: boolean;
  onPick: (icon: string) => void;
};

/** The icon row in an edit sheet: a pick here sticks through later renames. */
export function IconField({ kind, icon, chosen, onPick }: IconFieldProps) {
  return (
    <View style={styles.row}>
      <IconTile
        kind={kind}
        icon={icon}
        suggested={null}
        onPick={(picked) => {
          if (picked !== null) onPick(picked);
        }}
      />
      <View style={styles.text}>
        <ThemedText type="smallSemibold" themeColor="text">
          Icon
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {chosen ? 'Your pick. Tap to change.' : 'Follows the name. Tap to pick your own.'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
