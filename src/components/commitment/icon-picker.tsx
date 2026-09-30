import { router } from 'expo-router';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CommitmentKind } from './draft';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import {
  COMMITMENT_ICON_GROUPS,
  commitmentIcon,
  COMMITMENT_ICON_SVGS,
} from '@/constants/commitment-icons';
import { Fonts, Spacing } from '@/constants/theme';
import { isCommitmentIconKey } from '@/convex/lib/commitmentIcons';
import { useTheme } from '@/hooks/use-theme';

export type IconPickRequest = {
  kind: CommitmentKind;
  selected: string | null;
  suggested: string | null;
  /** A key picked by hand, or `null` for the suggestion (which then follows the name). */
  onPick: (icon: string | null) => void;
};

// The picker is a route (`/icon-picker`), so the system sheet gives it its
// liquid glass; the screen that opened it hears back through this one slot.
let pending: IconPickRequest | null = null;

/** Opens the picker sheet over whatever screen is showing. */
export function openIconPicker(request: IconPickRequest) {
  pending = request;
  router.push('/icon-picker');
}

/** The minimum a cell gets; columns are as many as fit, stretched to fill the row. */
const MIN_CELL = 52;
const GAP = Spacing.two;

const CellSize = createContext(MIN_CELL);

function cellSizeFor(width: number): number {
  if (width <= 0) return MIN_CELL;
  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CELL + GAP)));
  return Math.floor((width - GAP * (columns - 1)) / columns);
}

/** Every commitment icon, grouped, with the name check's suggestion first. */
export function IconPickerSheet() {
  const insets = useSafeAreaInsets();
  // Read once: a later request belongs to a later sheet.
  const [request] = useState(() => pending);
  const [gridWidth, setGridWidth] = useState(0);

  // Swiped away: nothing picked, and the slot is free again.
  useEffect(
    () => () => {
      if (pending === request) pending = null;
    },
    [request],
  );

  if (request === null) return null;
  const { kind, selected, suggested } = request;
  const suggestion = suggested !== null && isCommitmentIconKey(suggested) ? suggested : null;

  const pick = (icon: string | null) => {
    request.onPick(icon);
    router.back();
  };

  return (
    <ScrollView
      style={styles.sheet}
      onLayout={(event) => setGridWidth(event.nativeEvent.layout.width - Spacing.three * 2)}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}>
      <ThemedText style={styles.title} themeColor="text">
        Pick an icon
      </ThemedText>

      <CellSize value={cellSizeFor(gridWidth)}>
        {suggestion !== null ? (
          <Section label="Suggested for the name">
            <Cell
              label="Suggested icon"
              icon={commitmentIcon(suggestion, kind)}
              selected={selected === suggestion}
              onPress={() => pick(null)}
            />
          </Section>
        ) : null}

        {COMMITMENT_ICON_GROUPS.map((group) => (
          <Section key={group.label} label={group.label}>
            {group.icons.map(({ key, hint }) => (
              <Cell
                key={key}
                label={hint}
                icon={COMMITMENT_ICON_SVGS[key]}
                selected={selected === key}
                onPress={() => pick(key)}
              />
            ))}
          </Section>
        ))}
      </CellSize>
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.grid}>{children}</View>
    </View>
  );
}

function Cell({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: ReturnType<typeof commitmentIcon>;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const size = use(CellSize);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        { width: size, height: size },
        { backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement },
        selected && { borderColor: theme.text },
        pressed && styles.pressed,
      ]}>
      <Icon icon={icon} size={26} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  section: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
