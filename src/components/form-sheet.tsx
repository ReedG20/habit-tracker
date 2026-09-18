import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormSheetActions } from './form-sheet-actions';
import { ThemedText } from './themed-text';

import { Fonts, Spacing } from '@/constants/theme';

export type FormSheetProps = {
  title: string;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children: ReactNode;
};

export function FormSheet({
  title,
  submitLabel,
  onSubmit,
  submitDisabled = false,
  children,
}: FormSheetProps) {
  return (
    <View style={styles.sheet}>
      <ThemedText style={styles.title} themeColor="text">
        {title}
      </ThemedText>
      <View style={styles.fields}>{children}</View>
      <FormSheetActions submitLabel={submitLabel} onSubmit={onSubmit} disabled={submitDisabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  fields: {
    gap: Spacing.three,
  },
});
