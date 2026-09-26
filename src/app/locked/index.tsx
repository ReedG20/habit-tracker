import { useClerk } from '@clerk/expo';
import type { IconSvgElement } from '@hugeicons/react-native';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { GoalCard } from '@/components/goal-card';
import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  ArrowRight01Icon,
  CoinsDollarIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  Logout01Icon,
  Mail01Icon,
  SparklesIcon,
} from '@/constants/icons';
import { CardRadius, Fonts, PillRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { isMissed } from '@/data/goals';
import { useNow } from '@/hooks/use-now';
import { useReentryProduct } from '@/hooks/use-reentry-product';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { useSubscription } from '@/hooks/use-subscription';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/lib/confirm';
import { fromDayKey } from '@/lib/dates';
import { showDevTools } from '@/lib/dev-tools';
import {
  manageSubscriptionsUrl,
  purchaseReentry,
  REENTRY_PRODUCT_ID,
  revenueCatSupported,
} from '@/lib/revenuecat';

/** Where a user who thinks a photo was judged wrongly can write in. */
const SUPPORT_URL = 'mailto:support@useanteapp.com?subject=Ante%20lockout';

type Miss = Doc<'lockouts'>['misses'][number];

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** "Missed Tue, Sep 22" / "Came up short the week of Mon, Sep 21". */
function describeMiss(miss: Miss): string {
  const day = dayFormat.format(fromDayKey(miss.period));
  return miss.kind === 'day' ? `Missed ${day}` : `Came up short the week of ${day}`;
}

/**
 * The one screen a locked user gets: why it locked, the fee to get back in,
 * and the goals that are still due, since those keep running. No stats, no
 * habits, no way to make anything new.
 */
export default function LockedScreen() {
  const theme = useTheme();
  const now = useNow();
  const { signOut } = useClerk();
  const lockout = useQuery(api.lockouts.current);
  const goals = useQuery(api.goals.list);
  const reentry = useReentryProduct();
  const confirmReentry = useAction(api.lockouts.confirmReentry);
  // A purchase made before RevenueCat is logged in as this user would land on
  // an anonymous customer, and the server would never hear of it.
  const sessionReady = useSessionUserId() !== null;
  const { isPro, customerInfo } = useSubscription();
  const devOverrides = useQuery(api.lockouts.devOverrides, showDevTools ? {} : 'skip');
  const devUnlock = useMutation(api.lockouts.devUnlock);
  const [busy, setBusy] = useState<'buying' | 'checking' | null>(null);

  // Bought after this lock began: the store has the money, and the lock lifts
  // as soon as the server hears of it. Read from the SDK, so it survives a
  // relaunch and the buy button can never take a second payment meanwhile.
  const paid =
    lockout != null &&
    (customerInfo?.nonSubscriptionTransactions.some(
      (transaction) =>
        transaction.productIdentifier === REENTRY_PRODUCT_ID &&
        Date.parse(transaction.purchaseDate) >= lockout.lockedAt,
    ) ??
      false);

  const dueGoals =
    goals?.filter((goal) => goal.completedAt === undefined && !isMissed(goal, now)) ?? [];

  const buy = async () => {
    if (reentry.status !== 'ready' || busy !== null) return;
    setBusy('buying');
    try {
      const result = await purchaseReentry(reentry.product);
      if (result.kind === 'cancelled') return;
      // The webhook unlocks as well; asking RevenueCat directly just skips the
      // wait. Once the lock clears, the root guard swaps this screen for the tabs.
      await confirmReentry().catch((error: unknown) => {
        console.warn('Re-entry confirmation failed; waiting for the webhook', error);
      });
    } catch (error: unknown) {
      console.error('Re-entry purchase failed', error);
      notify(
        "Couldn't complete the purchase",
        error instanceof Error ? error.message : 'Nothing was charged. Try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const checkAgain = async () => {
    if (busy !== null) return;
    setBusy('checking');
    try {
      const { locked } = await confirmReentry();
      if (locked) {
        notify('No payment found yet', 'If you just paid, give it a minute and check again.');
      }
    } catch (error: unknown) {
      console.error('Re-entry check failed', error);
      notify("Couldn't check", 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const footer: { id: string; label: string; icon: IconSvgElement; onPress: () => void }[] = [
    {
      id: 'check',
      label: busy === 'checking' ? 'Checking…' : 'Already paid? Check again',
      icon: CoinsDollarIcon,
      onPress: () => void checkAgain(),
    },
    // Apple owns cancellation; a locked subscriber must still be able to reach it.
    ...(isPro && revenueCatSupported
      ? [
          {
            id: 'subscription',
            label: 'Manage subscription',
            icon: SparklesIcon,
            onPress: () => void Linking.openURL(manageSubscriptionsUrl),
          },
        ]
      : []),
    {
      id: 'support',
      label: 'Contact support',
      icon: Mail01Icon,
      onPress: () => void Linking.openURL(SUPPORT_URL),
    },
    { id: 'sign-out', label: 'Sign out', icon: Logout01Icon, onPress: () => void signOut() },
    ...(devOverrides === true
      ? [
          {
            id: 'dev-unlock',
            label: 'Unlock (developer)',
            icon: LockKeyholeOpenIcon,
            onPress: () => {
              devUnlock().catch((error: unknown) => console.error('Failed to unlock', error));
            },
          },
        ]
      : []),
  ];

  return (
    <ScreenScrollView>
      <View style={styles.header}>
        <View style={[styles.lockBadge, { backgroundColor: theme.backgroundElement }]}>
          <Icon icon={LockKeyholeIcon} size={36} strokeWidth={2} themeColor="accent" />
        </View>
        <ThemedText style={styles.title} themeColor="text">
          Ante is locked
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          You fell short on a habit, so your habits are frozen until you pay to get back in.
        </ThemedText>
      </View>

      {lockout && lockout.misses.length > 0 ? (
        <ThemedView type="backgroundElement" style={styles.group}>
          {lockout.misses.map((miss, index) => (
            <View
              key={miss.habitId}
              style={[
                styles.missRow,
                index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
              ]}>
              <ThemedText style={styles.flex} numberOfLines={1}>
                {miss.title}
              </ThemedText>
              <ThemedText type="small" themeColor="accent">
                {describeMiss(miss)}
              </ThemedText>
            </View>
          ))}
        </ThemedView>
      ) : null}

      <View style={styles.pay}>
        {paid ? (
          <>
            <ActionButton label="Payment received · unlocking…" fill disabled onPress={() => {}} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              This usually takes a few seconds. Still here after a minute? Tap “Already paid? Check
              again” below.
            </ThemedText>
          </>
        ) : reentry.status === 'unavailable' ? (
          <>
            <ThemedText themeColor="textSecondary">
              The re-entry fee can’t be loaded right now.
            </ThemedText>
            <ActionButton label="Try again" fill onPress={reentry.retry} />
          </>
        ) : (
          <ActionButton
            label={
              busy === 'buying'
                ? 'Getting you back in…'
                : reentry.status === 'ready'
                  ? `Get back in · ${reentry.product.priceString}`
                  : 'Get back in'
            }
            variant="primary"
            fill
            disabled={reentry.status !== 'ready' || !sessionReady || busy !== null}
            onPress={() => void buy()}
          />
        )}
        {paid ? null : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Your streaks start over. The day you come back is free.
          </ThemedText>
        )}
      </View>

      {dueGoals.length > 0 ? (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle} themeColor="text">
            goals still due
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionNote}>
            Goals keep their deadlines while Ante is locked. You can still submit proof.
          </ThemedText>
          <View style={styles.list}>
            {dueGoals.map((goal) => (
              <GoalCard
                key={goal._id}
                goal={goal}
                now={now}
                detailHref={null}
                submitHref={`/locked/goal/${goal._id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      <ThemedView type="backgroundElement" style={styles.group}>
        {footer.map((row, index) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={row.onPress}
            style={({ pressed }) => [
              styles.footerRow,
              index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Icon icon={row.icon} size={22} themeColor="textSecondary" />
            <ThemedText style={styles.flex}>{row.label}</ThemedText>
            <Icon icon={ArrowRight01Icon} size={18} themeColor="textSecondary" />
          </Pressable>
        ))}
      </ThemedView>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.five,
    gap: Spacing.two,
  },
  lockBadge: {
    width: 72,
    height: 72,
    borderRadius: PillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: ScreenHeadingTypography,
  group: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  missRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  pay: {
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
    paddingHorizontal: Spacing.one,
  },
  sectionNote: {
    paddingHorizontal: Spacing.one,
  },
  list: {
    gap: Spacing.three,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
