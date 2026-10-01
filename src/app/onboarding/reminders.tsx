import { useConvexAuth } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { NotificationPreview } from '@/components/reminders/notification-preview';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DEFAULT_REMINDER_SETTINGS } from '@/convex/lib/reminderPresets';
import { commitmentNoun, freshDueAt } from '@/data/onboarding';
import { previewPushes, type PreviewSubject } from '@/data/reminder-preview';
import { track } from '@/lib/analytics';
import { endOfDay, todayKey } from '@/lib/dates';
import { canNotify, requestPermission, useNotificationPermission } from '@/lib/notifications';
import { useOnboarding } from '@/lib/onboarding';

/**
 * The permission ask, right after the contract is signed: the moment a
 * heads-up is most obviously useful. It shows the actual pushes their new
 * commitment would get, then lets iOS ask. "Not now" is always there; the
 * Today screen asks again later while something's on the line.
 */
export default function RemindersStepScreen() {
  const { isAuthenticated } = useConvexAuth();
  const { draft } = useOnboarding();
  const permission = useNotificationPermission();
  const [asking, setAsking] = useState(false);
  // Fixed for the screen's life, so the preview doesn't shift under the user.
  const [now] = useState(() => Date.now());

  if (draft === null) {
    return <Redirect href="/onboarding" />;
  }

  const next = (granted: boolean) => {
    track('onboarding step completed', { step: 'reminders', notifications_granted: granted });
    router.push(isAuthenticated ? '/onboarding/paywall' : '/onboarding/save');
  };

  const noun = commitmentNoun(draft.kind);
  const title = draft.title.trim();
  const subject: PreviewSubject =
    draft.kind === 'habit'
      ? { kind: 'habit', title }
      : {
          kind: 'goal',
          title,
          dueAt: freshDueAt(draft.dueAt, now),
          createdAt: now,
          stakeCents: null,
        };
  const pushes = previewPushes(subject, DEFAULT_REMINDER_SETTINGS, {
    dayEnd: endOfDay(todayKey()),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const turnOn = async () => {
    setAsking(true);
    let granted = false;
    try {
      granted = canNotify(await requestPermission());
    } catch (error: unknown) {
      console.warn('Could not ask for notifications', error);
    } finally {
      setAsking(false);
    }
    next(granted);
  };

  const allowed = canNotify(permission);

  return (
    <OnboardingScreen
      step="reminders"
      title="Want a heads-up before it’s due?"
      subtitle={`Ante only nudges while your ${noun} is still open. Get it done early and it stays quiet.`}
      footer={
        <>
          <ActionButton
            label={allowed ? 'Continue' : 'Turn on reminders'}
            variant="primary"
            fill
            disabled={asking}
            onPress={allowed ? () => next(true) : () => void turnOn()}
          />
          {allowed ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => next(false)}
              hitSlop={Spacing.two}
              style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="textSecondary">
                Not now
              </ThemedText>
            </Pressable>
          )}
        </>
      }>
      <NotificationPreview pushes={pushes} showDay={subject.kind === 'goal'} />
      <ThemedText type="small" themeColor="textSecondary">
        Firm is the default: a nudge, then a last call. Change it any time under Me → Reminders.
      </ThemedText>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  notNow: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
