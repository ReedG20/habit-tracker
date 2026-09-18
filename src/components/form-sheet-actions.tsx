import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';

import { Spacing } from '@/constants/theme';

export type FormSheetActionsProps = {
  submitLabel: string;
  onSubmit: () => void;
  /** Greys out and ignores presses on the submit button; Cancel keeps working. */
  disabled?: boolean;
};

export function FormSheetActions({
  submitLabel,
  onSubmit,
  disabled = false,
}: FormSheetActionsProps) {
  return (
    <View style={styles.row}>
      <ActionButton label="Cancel" onPress={() => router.back()} />
      <ActionButton
        label={submitLabel}
        variant="primary"
        fill
        onPress={onSubmit}
        disabled={disabled}
        style={styles.main}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  main: {
    flex: 1,
  },
});
