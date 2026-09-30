import { StyleSheet } from 'react-native';

import { ActionButton } from './action-button';

import { Add01Icon, LockKeyholeIcon } from '@/constants/icons';

export type HeaderAddButtonProps = {
  label: string;
  onPress: () => void;
  /** Shows a lock in place of the plus: the action needs Ante Pro first. */
  locked?: boolean;
};

/** Compact control that sits under a screen heading. */
export function HeaderAddButton({ label, onPress, locked = false }: HeaderAddButtonProps) {
  return (
    <ActionButton
      label={label}
      icon={locked ? LockKeyholeIcon : Add01Icon}
      accessibilityLabel={locked ? `${label}, needs Ante Pro` : undefined}
      size="small"
      onPress={onPress}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
  },
});
