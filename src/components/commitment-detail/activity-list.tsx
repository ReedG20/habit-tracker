import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ReplayMask } from '@/components/replay-mask';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Alert02Icon, Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from '@/constants/icons';
import { BorderRadius, CardRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { previousDay } from '@/convex/lib/days';
import { dayKeyAt, fromDayKey, todayKey } from '@/lib/dates';

export type ActivityStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export type ActivityItem = {
  id: string;
  status: ActivityStatus;
  /** What happened: "Checked in", "Didn't count". */
  title: string;
  at: number;
  /** The check's own words, or the user's note. */
  lines?: string[];
  photos?: { key: string; url: string }[];
};

const BADGE = 32;
const THUMBNAIL = 64;

const STATUS_ICONS = {
  approved: CheckmarkCircle02Icon,
  rejected: Cancel01Icon,
  failed: Alert02Icon,
  pending: Clock01Icon,
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/**
 * "Today", "Yesterday", or "Mon, Sep 28": the day it counted for, so a 1 AM
 * check-in reads as the night before, the way it was judged.
 */
function dayLabel(at: number): string {
  const day = dayKeyAt(at);
  const today = todayKey();
  if (day === today) return 'Today';
  if (day === previousDay(today)) return 'Yesterday';
  return dateFormat.format(fromDayKey(day));
}

/** Every attempt at a commitment, newest first, kept or not, with the reason it was judged so. */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.group}>
      {items.map((item, index) => {
        const tone =
          item.status === 'approved'
            ? { background: theme.accentElement, color: theme.accent }
            : item.status === 'rejected'
              ? { background: theme.backgroundSelected, color: theme.text }
              : { background: theme.backgroundSelected, color: theme.textSecondary };
        return (
          <View
            key={item.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
              },
            ]}>
            <View style={[styles.badge, { backgroundColor: tone.background }]}>
              <Icon icon={STATUS_ICONS[item.status]} size={18} strokeWidth={2} color={tone.color} />
            </View>
            <View style={styles.body}>
              <View style={styles.heading}>
                <ThemedText type="smallSemibold" style={styles.title} numberOfLines={1}>
                  {item.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {dayLabel(item.at)} · {timeFormat.format(new Date(item.at))}
                </ThemedText>
              </View>
              {item.lines?.map((line) => (
                <ThemedText key={line} type="small" themeColor="textSecondary">
                  {line}
                </ThemedText>
              ))}
              {item.photos === undefined || item.photos.length === 0 ? null : (
                <ReplayMask style={styles.thumbnails}>
                  {item.photos.map((photo, photoIndex) => (
                    <Image
                      key={photo.key}
                      source={{ uri: photo.url }}
                      style={[styles.thumbnail, { backgroundColor: theme.background }]}
                      contentFit="cover"
                      accessibilityLabel={`Photo ${photoIndex + 1} of ${item.photos?.length}`}
                    />
                  ))}
                </ReplayMask>
              )}
            </View>
          </View>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: CardRadius,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  thumbnails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    borderRadius: BorderRadius,
  },
});
