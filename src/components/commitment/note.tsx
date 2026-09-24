import { StyleSheet, type TextProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';

/** A handwritten aside to the user, in Mansalva. */
export function Note({ style, ...rest }: TextProps) {
  return <ThemedText themeColor="text" style={[styles.note, style]} {...rest} />;
}

const styles = StyleSheet.create({
  // Mansalva's ascenders run tall: a roomy line box keeps them from clipping.
  note: {
    fontFamily: Fonts.note,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: 'normal',
  },
});
