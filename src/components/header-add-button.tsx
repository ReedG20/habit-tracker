import { StyleSheet } from 'react-native';

import { ActionButton } from './action-button';

import { Add01Icon } from '@/constants/icons';

export type HeaderAddButtonProps = {
  label: string;
  onPress: () => void;
};

/** Compact control that sits under a screen heading. */
export function HeaderAddButton({ label, onPress }: HeaderAddButtonProps) {
  return (
    <ActionButton
      label={label}
      icon={Add01Icon}
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
