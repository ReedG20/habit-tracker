import type { IconSvgElement } from '@hugeicons/react-native';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Note } from '@/components/commitment/note';
import { Icon } from '@/components/icon';
import { NotificationPreview } from '@/components/reminders/notification-preview';
import { NotificationsStatusCard } from '@/components/reminders/notifications-status-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { SegmentedPicker } from '@/components/segmented-picker';
import { Switch } from '@/components/switch';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Moon02Icon,
  Notification01Icon,
  Sun03Icon,
} from '@/constants/icons';
import { CardRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import {
  DEFAULT_REMINDER_SETTINGS,
  PRESET_RULES,
  REMINDER_PRESETS,
  type ReminderPreset,
  type ReminderSettings,
} from '@/convex/lib/reminderPresets';
import { pickPreviewSubject, previewPushes } from '@/data/reminder-preview';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { endOfDay, todayKey } from '@/lib/dates';
import { canNotify, useNotificationPermission } from '@/lib/notifications';

const presetOptions = REMINDER_PRESETS.map((preset) => ({
  value: preset,
  label: PRESET_RULES[preset].label,
}));

type Toggle = {
  key: 'morningLineup' | 'breakThroughFocus' | 'approvals';
  label: string;
  detail: string;
  icon: IconSvgElement;
};

const toggles: Toggle[] = [
  {
    key: 'breakThroughFocus',
    label: 'Break through Focus',
    detail: 'Last calls get past Focus modes.',
    icon: Moon02Icon,
  },
  {
    key: 'morningLineup',
    label: 'Morning lineup',
    detail: '8:30 AM, when something’s due.',
    icon: Sun03Icon,
  },
  {
    key: 'approvals',
    label: 'Approval notes',
    detail: 'When a photo or check-in passes.',
    icon: CheckmarkCircle02Icon,
  },
];

/**
 * How hard Ante pushes before a deadline, pushed in from the Me tab. Kept
 * mostly visual: the preview under the picker is the real thing (the
 * backend's own timing and words, for one of the user's own commitments), so
 * it explains each preset better than a description would.
 */
export default function RemindersScreen() {
  const theme = useTheme();
  const now = useNow();
  const permission = useNotificationPermission();
  const saved = useQuery(api.reminders.settings);
  const habits = useQuery(api.habits.list, { today: todayKey() });
  const goals = useQuery(api.goals.list);
  const sendTest = useMutation(api.push.sendTest);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const updateSettings = useMutation(api.reminders.updateSettings).withOptimisticUpdate(
    (store, change) => {
      const current = store.getQuery(api.reminders.settings, {});
      if (current !== undefined) {
        store.setQuery(api.reminders.settings, {}, { ...current, ...change });
      }
    },
  );

  const settings: ReminderSettings = saved ?? DEFAULT_REMINDER_SETTINGS;
  const change = (patch: Partial<ReminderSettings>) => {
    updateSettings(patch).catch((error: unknown) => {
      console.error('Failed to save reminder settings', error);
    });
  };

  const subject = pickPreviewSubject(habits, goals, now);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pushes = previewPushes(subject, settings, { dayEnd: endOfDay(todayKey()), timeZone });

  const test = async () => {
    setTestStatus('Sending…');
    try {
      const { devices, delivering } = await sendTest({});
      setTestStatus(
        devices === 0
          ? 'Turn notifications on first.'
          : !delivering
            ? "This server doesn't deliver pushes (PUSH_DELIVERY is off)."
            : 'Sent. Should land any second.',
      );
    } catch {
      setTestStatus('Easy there. Try again in a minute.');
    }
  };

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={Spacing.three}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon icon={ArrowLeft01Icon} size={20} strokeWidth={2} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            Me
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.title} themeColor="text">
          Reminders
        </ThemedText>
        <NotificationsStatusCard permission={permission} />
      </View>

      <View style={styles.section}>
        <SegmentedPicker<ReminderPreset>
          options={presetOptions}
          value={settings.preset}
          onChange={(preset) => change({ preset })}
        />
        <NotificationPreview pushes={pushes} showDay={subject.kind === 'goal'} />
        <Note style={styles.note}>done early? you won’t hear a peep.</Note>
      </View>

      <ThemedView type="backgroundElement" style={styles.group}>
        {toggles.map((toggle, index) => (
          <View
            key={toggle.key}
            style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <Icon icon={toggle.icon} size={22} themeColor="textSecondary" />
            <View style={styles.rowText}>
              <ThemedText themeColor="text">{toggle.label}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {toggle.detail}
              </ThemedText>
            </View>
            <Switch
              value={settings[toggle.key]}
              onChange={(value) => change({ [toggle.key]: value })}
              accessibilityLabel={toggle.label}
            />
          </View>
        ))}
      </ThemedView>

      {canNotify(permission) ? (
        <View style={styles.test}>
          <ActionButton
            label="Send a test"
            icon={Notification01Icon}
            size="small"
            onPress={() => void test()}
          />
          {testStatus !== null ? (
            <ThemedText type="small" themeColor="textSecondary">
              {testStatus}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  // The tab's own screens sit this close under the status bar; a back row is
  // already a line of breathing room.
  header: {
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  title: ScreenHeadingTypography,
  pressed: {
    opacity: 0.7,
  },
  section: {
    gap: Spacing.three,
  },
  note: {
    textAlign: 'center',
  },
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  test: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});
