import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Alert02Icon, ArrowLeft01Icon, Delete02Icon } from '@/constants/icons';
import { CardRadius, ScreenHeadingTypography, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import { useSettleUp } from '@/hooks/use-settle-up';
import { captureError, track } from '@/lib/analytics';
import { confirmDestructive, notify } from '@/lib/confirm';
import { formatCents } from '@/lib/money';
import { manageSubscriptionsUrl, revenueCatSupported } from '@/lib/revenuecat';
import { userErrorMessage } from '@/lib/user-errors';

const deleted = [
  'Your habits and goals, and all their history',
  'Every proof photo and check-in',
  'Your signed contracts and everything you’ve kept',
  'The friends you named, and your reminders',
  'Your saved cards',
];

/** Spells out what deleting the account takes with it, then does it. */
export default function DeleteAccountScreen() {
  const preview = useQuery(api.accountDeletion.preview);
  const deleteAccount = useDeleteAccount();
  const settleUp = useSettleUp();
  const [deleting, setDeleting] = useState(false);
  const [settling, setSettling] = useState<Id<'stakes'> | null>(null);

  const settle = async (stakeId: Id<'stakes'>) => {
    if (settling !== null) return;
    setSettling(stakeId);
    try {
      const result = await settleUp.settle(stakeId);
      track('stake settled', { result });
      if (result === 'pending') {
        notify('Payment received', 'It can take a minute to show up here.');
      }
    } catch (error: unknown) {
      captureError(error, 'settle up');
      notify('That didn’t go through', userErrorMessage(error, 'Try another card.'));
    } finally {
      setSettling(null);
    }
  };

  const run = async () => {
    setDeleting(true);
    try {
      // Signs out on success, which leaves this screen.
      await deleteAccount();
    } catch (error: unknown) {
      captureError(error, 'delete account');
      notify(
        'Your account wasn’t deleted',
        userErrorMessage(error, 'Something went wrong. Try again.'),
      );
      setDeleting(false);
    }
  };

  const confirm = () =>
    confirmDestructive({
      title: 'Delete your account?',
      message: 'Everything listed goes for good. This can’t be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => void run(),
    });

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
          Delete account
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallSemibold">This deletes, for good:</ThemedText>
        {deleted.map((line) => (
          <ThemedText key={line} themeColor="textSecondary">
            {`• ${line}`}
          </ThemedText>
        ))}
        <ThemedText themeColor="textSecondary">
          {preview !== undefined && preview !== null && preview.armedMoneyCents > 0
            ? `Nothing on the line comes due: the ${formatCents(preview.armedMoneyCents)} you have riding isn’t charged, and no friend hears about it.`
            : 'Nothing on the line comes due: no money is charged, and no friend hears about it.'}
        </ThemedText>
      </ThemedView>

      {preview?.charging ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.cardTitle}>
            <Icon icon={Alert02Icon} size={20} strokeWidth={2} themeColor="accent" />
            <ThemedText type="smallSemibold">A charge is going through</ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">
            One of your stakes is being charged right now. You can delete your account once it
            finishes, in a few minutes.
          </ThemedText>
        </ThemedView>
      ) : null}

      {preview && preview.owed.length > 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.cardTitle}>
            <Icon icon={Alert02Icon} size={20} strokeWidth={2} themeColor="accent" />
            <ThemedText type="smallSemibold">Still owed</ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">
            Your card was declined for these. Deleting your account doesn’t cancel what you owe.
          </ThemedText>
          {preview.owed.map((owed) => (
            <View key={owed.stakeId} style={styles.owedRow}>
              <ThemedText style={styles.owedLabel} numberOfLines={2}>
                {`${formatCents(owed.amountCents)} · ${owed.title}`}
              </ThemedText>
              {settleUp.supported ? (
                <ActionButton
                  label={settling === owed.stakeId ? 'Opening…' : 'Pay now'}
                  size="small"
                  disabled={settling !== null || deleting}
                  onPress={() => void settle(owed.stakeId)}
                />
              ) : null}
            </View>
          ))}
        </ThemedView>
      ) : null}

      {revenueCatSupported ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallSemibold">Ante Pro</ThemedText>
          <ThemedText themeColor="textSecondary">
            Apple bills Ante Pro, so deleting your account doesn’t cancel it. If you’re
            subscribed, cancel it in your App Store subscriptions first.
          </ThemedText>
          <ActionButton
            label="Manage subscription"
            size="small"
            style={styles.cardButton}
            onPress={() => void Linking.openURL(manageSubscriptionsUrl)}
          />
        </ThemedView>
      ) : null}

      <ActionButton
        label={deleting ? 'Deleting…' : 'Delete account'}
        variant="destructive"
        icon={Delete02Icon}
        fill
        disabled={preview == null || preview.charging || deleting || settling !== null}
        onPress={confirm}
      />
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  // Same back row and heading as the other Me pages.
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
  card: {
    borderRadius: CardRadius,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardButton: {
    alignSelf: 'flex-start',
  },
  owedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  owedLabel: {
    flex: 1,
  },
});
