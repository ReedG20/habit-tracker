import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardRadius, Spacing } from '@/constants/theme';
import type { Term } from '@/data/commitment-terms';
import { useTheme } from '@/hooks/use-theme';

const ICON_TILE = 36;

/** A commitment's terms, a row each: what it is, then what that means. */
export function TermsCard({ terms }: { terms: Term[] }) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {terms.map((term, index) => (
        <View
          key={term.key}
          accessible
          accessibilityLabel={[term.label, term.value, term.note].filter(Boolean).join('. ')}
          style={styles.row}>
          <View
            style={[
              styles.iconTile,
              { backgroundColor: term.accent ? theme.accentElement : theme.background },
            ]}>
            <Icon
              icon={term.icon}
              size={20}
              strokeWidth={2}
              themeColor={term.accent ? 'accent' : 'text'}
            />
          </View>
          <View
            style={[
              styles.body,
              // A hairline between rows, starting under the text rather than the icon.
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              {term.label}
            </ThemedText>
            <ThemedText
              type={term.accent ? 'smallBold' : 'smallSemibold'}
              themeColor={term.accent ? 'accent' : 'text'}
              style={styles.value}>
              {term.value}
            </ThemedText>
            {term.note === undefined ? null : (
              <ThemedText type="small" themeColor="textSecondary">
                {term.note}
              </ThemedText>
            )}
          </View>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: ICON_TILE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Spacing.three,
    gap: Spacing.half,
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
  },
});
