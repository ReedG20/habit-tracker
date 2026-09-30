import type { IconSvgElement } from '@hugeicons/react-native';
import { StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';

export type CardDetailRowProps = {
  icon: IconSvgElement;
  text: string;
  /** A second, quieter line under it (a rejection's reason). */
  detail?: string;
  /** What's at stake right now: drawn in the accent. */
  accent?: boolean;
};

/** One labelled line in a Commitments card's details: an icon, then the words. */
export function CardDetailRow({ icon, text, detail, accent = false }: CardDetailRowProps) {
  return (
    <View style={styles.row}>
      <Icon
        icon={icon}
        size={18}
        strokeWidth={2}
        themeColor={accent ? 'accent' : 'textSecondary'}
      />
      <View style={styles.text}>
        <ThemedText
          type={accent ? 'smallSemibold' : 'small'}
          themeColor={accent ? 'accent' : 'textSecondary'}
          numberOfLines={2}>
          {text}
        </ThemedText>
        {detail ? (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            numberOfLines={2}
            style={styles.detail}>
            “{detail}”
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/** "Me at the gym" reads as "Photo of me at the gym"; names and acronyms keep their capital. */
export function lowerFirst(text: string): string {
  const [first, second] = text;
  if (first === undefined || (second !== undefined && /[A-Z]/.test(second))) return text;
  return first.toLowerCase() + text.slice(1);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  detail: {
    fontStyle: 'italic',
  },
});
