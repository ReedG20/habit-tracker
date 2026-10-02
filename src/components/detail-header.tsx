import type { IconSvgElement } from '@hugeicons/react-native';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from './action-button';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { ArrowLeft01Icon, Delete02Icon, Edit02Icon, Share03Icon } from '@/constants/icons';
import { ScreenHeadingTypography, Spacing } from '@/constants/theme';

export type DetailHeaderProps = {
  title: string;
  description?: string;
  onEdit: () => void;
  /** Leave out to hide the button (a habit already ending has nothing left to end). */
  onDelete?: () => void;
  deleteLabel: string;
  /** The button's visible text and icon: "End" with a flag for a habit that gives notice. */
  deleteText?: string;
  deleteIcon?: IconSvgElement;
  /** Leave out to hide the button: there's nothing live to show off. */
  onShare?: () => void;
};

/** Back row, heading, and the edit/delete pair shared by both detail screens. */
export function DetailHeader({
  title,
  description,
  onEdit,
  onDelete,
  deleteLabel,
  deleteText = 'Delete',
  deleteIcon = Delete02Icon,
  onShare,
}: DetailHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={Spacing.three}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Icon icon={ArrowLeft01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
        <ThemedText type="small" themeColor="textSecondary">
          Back
        </ThemedText>
      </Pressable>

      <ThemedText style={styles.title} themeColor="text">
        {title}
      </ThemedText>

      {description ? <ThemedText themeColor="textSecondary">{description}</ThemedText> : null}

      <View style={styles.actions}>
        <ActionButton
          label="Edit"

          icon={Edit02Icon}
          size="small"
          onPress={onEdit}
        />
        {onShare === undefined ? null : (
          <ActionButton label="Share" icon={Share03Icon} size="small" onPress={onShare} />
        )}
        {onDelete === undefined ? null : (
          <ActionButton
            label={deleteText}
            accessibilityLabel={deleteLabel}
            icon={deleteIcon}
            variant="destructive"
            size="small"
            onPress={onDelete}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
