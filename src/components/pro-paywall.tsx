import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { ActionButton } from '@/components/action-button';
import { Icon } from '@/components/icon';
import { PlanCard } from '@/components/plan-card';
import { ThemedText } from '@/components/themed-text';
import { Camera01Icon, CoinsDollarIcon, FlameIcon, SparklesIcon } from '@/constants/icons';
import { Fonts, Spacing } from '@/constants/theme';
import { useSessionUserId } from '@/hooks/use-signed-in-session';
import { useSubscription } from '@/hooks/use-subscription';
import {
  checkTrialEligibility,
  hasPro,
  loadProOffering,
  purchasePackage,
  restorePurchases,
  revenueCatSupported,
  type ProOffering,
} from '@/lib/revenuecat';

// TODO: replace with the real URLs before the App Store listing goes live.
const TERMS_URL = 'https://useanteapp.com/terms';
const PRIVACY_URL = 'https://useanteapp.com/privacy';

/** Placeholder copy until the free/Pro split is decided. */
const benefits = [
  { icon: FlameIcon, label: 'Unlimited habits and goals' },
  { icon: Camera01Icon, label: 'Photo verification on every check-in' },
  { icon: CoinsDollarIcon, label: 'Put stakes on any goal' },
];

type Plan = 'annual' | 'monthly';

export type PaywallOutcome = 'purchased' | 'restored';

export type ProPaywallProps = {
  /** Replaces the default "Ante Pro" title block. */
  header?: ReactNode;
  /** After a successful purchase or restore; the caller dismisses and toasts. */
  onFinished: (outcome: PaywallOutcome) => void;
  /** The "Done" button when already subscribed, or the sheet's own dismissal. */
  onDismiss: () => void;
  /** A quiet way out under the main button, e.g. onboarding's "Not now". */
  secondaryAction?: { label: string; onPress: () => void };
};

/**
 * The paywall body, shared by the `/pro` sheet and the onboarding paywall.
 * Prices come from the store through RevenueCat, never from code, so a price
 * change in App Store Connect needs no release. Errors are rendered inline: a
 * UIKit sheet sits above the toast host. The caller provides the scroll view.
 */
export function ProPaywall({ header, onFinished, onDismiss, secondaryAction }: ProPaywallProps) {
  const { isPro } = useSubscription();

  // RevenueCat is only logged in as this user once the session has stored
  // them; buying before that would credit an anonymous customer.
  const sessionReady = useSessionUserId() !== null;

  // Once you own the subscription the selling half of this screen disappears,
  // which makes it impossible to iterate on. A debug-only button below brings
  // it back; a release build never renders that button.
  const [previewing, setPreviewing] = useState(false);

  // `undefined` while loading; `null` when the store has nothing to sell.
  const [offering, setOffering] = useState<ProOffering | null | undefined>(undefined);
  const [selected, setSelected] = useState<Plan>('annual');
  const [trialEligible, setTrialEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped by Retry; the effect re-runs and the loading state shows again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadProOffering()
      .then(async (loaded) => {
        if (cancelled) return;
        setOffering(loaded);
        if (loaded !== null) {
          const eligible = await checkTrialEligibility(loaded.annual.product.identifier);
          if (!cancelled) setTrialEligible(eligible);
        }
      })
      .catch((caught: unknown) => {
        console.error('Failed to load the Pro offering', caught);
        if (!cancelled) setOffering(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setOffering(undefined);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const buy = async (pkg: PurchasesPackage) => {
    setBusy(true);
    setError(null);
    try {
      const result = await purchasePackage(pkg);
      if (result.kind === 'purchased') {
        onFinished('purchased');
      }
    } catch (caught: unknown) {
      console.error('Purchase failed', caught);
      setError(describeError(caught, "Couldn't complete the purchase."));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await restorePurchases();
      if (hasPro(info)) {
        onFinished('restored');
      } else {
        setError('No Ante Pro subscription was found for this Apple ID.');
      }
    } catch (caught: unknown) {
      console.error('Restore failed', caught);
      setError(describeError(caught, "Couldn't restore purchases."));
    } finally {
      setBusy(false);
    }
  };

  const secondary =
    secondaryAction !== undefined ? (
      <Pressable
        key="secondary"
        accessibilityRole="button"
        disabled={busy}
        onPress={secondaryAction.onPress}
        style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
        <ThemedText type="smallSemibold" themeColor="textSecondary">
          {secondaryAction.label}
        </ThemedText>
      </Pressable>
    ) : null;

  return (
    <View style={styles.body}>
      {header ?? (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Icon icon={SparklesIcon} size={26} themeColor="primary" />
            <ThemedText style={styles.title} themeColor="text">
              Ante Pro
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">
            Everything Ante can do, with nothing held back.
          </ThemedText>
        </View>
      )}

      <View style={styles.benefits}>
        {benefits.map((benefit) => (
          <View key={benefit.label} style={styles.benefit}>
            <Icon icon={benefit.icon} size={22} themeColor="primary" />
            <ThemedText style={styles.benefitLabel}>{benefit.label}</ThemedText>
          </View>
        ))}
      </View>

      {isPro && !previewing ? (
        <>
          <ThemedText>You already have Ante Pro. Thank you for backing your habits.</ThemedText>
          <ActionButton
            key="done"
            label={secondaryAction?.label === undefined ? 'Done' : 'Continue'}
            variant="primary"
            fill
            onPress={secondaryAction?.onPress ?? onDismiss}
          />
          {__DEV__ && (
            <ActionButton
              key="preview"
              label="Show plans (dev)"
              onPress={() => setPreviewing(true)}
            />
          )}
        </>
      ) : !revenueCatSupported ? (
        <>
          <ThemedText themeColor="textSecondary">
            Subscriptions are coming to this platform. For now, subscribe from the iPhone app.
          </ThemedText>
          {secondary}
        </>
      ) : offering === undefined ? (
        <>
          <ThemedText themeColor="textSecondary">Loading plans…</ThemedText>
          {secondary}
        </>
      ) : offering === null ? (
        <>
          <ThemedText themeColor="textSecondary">
            Plans aren&apos;t available right now. Check your connection and try again.
          </ThemedText>
          <ActionButton label="Retry" onPress={retry} />
          {secondary}
        </>
      ) : (
        <>
          <View style={styles.plans}>
            <PlanCard
              title="Yearly"
              priceLine={`${offering.annual.product.priceString} / year`}
              subline={perMonth(offering.annual)}
              badge={offering.annual.product.introPrice !== null ? '7-day free trial' : undefined}
              selected={selected === 'annual'}
              onPress={() => setSelected('annual')}
            />
            <PlanCard
              title="Monthly"
              priceLine={`${offering.monthly.product.priceString} / month`}
              selected={selected === 'monthly'}
              onPress={() => setSelected('monthly')}
            />
          </View>

          {error !== null && (
            <ThemedText type="small" themeColor="accent">
              {error}
            </ThemedText>
          )}

          {/* Keyed: without it React reuses the unfilled button that sits at
              this index in the entitled branch, and the SwiftUI host keeps
              that button's narrower measurement. */}
          <ActionButton
            key="subscribe"
            label={
              busy || !sessionReady
                ? 'One moment…'
                : selected === 'annual' && trialEligible
                  ? 'Start 7-day free trial'
                  : 'Subscribe'
            }
            variant="primary"
            fill
            disabled={busy || !sessionReady}
            onPress={() => void buy(selected === 'annual' ? offering.annual : offering.monthly)}
          />

          {secondary}

          <Pressable
            accessibilityRole="button"
            disabled={busy || !sessionReady}
            onPress={() => void restore()}
            style={({ pressed }) => [styles.restore, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              Restore purchases
            </ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
            Renews automatically until cancelled. Cancel anytime in Settings → Apple ID →
            Subscriptions.{' '}
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.legalLink}
              onPress={() => void Linking.openURL(TERMS_URL)}>
              Terms
            </ThemedText>
            {' · '}
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.legalLink}
              onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Privacy
            </ThemedText>
          </ThemedText>
        </>
      )}
    </View>
  );
}

/** "≈ $4.17 / month" for the annual card, in the store's own currency. */
function perMonth(annual: PurchasesPackage): string | undefined {
  const { pricePerMonthString } = annual.product;
  return pricePerMonthString ? `≈ ${pricePerMonthString} / month` : undefined;
}

function describeError(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontFamily: Fonts.sectionHeading,
    fontSize: 22,
    lineHeight: 28,
  },
  benefits: {
    gap: Spacing.two,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  benefitLabel: {
    flex: 1,
  },
  plans: {
    gap: Spacing.two,
  },
  restore: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  quiet: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  legal: {
    textAlign: 'center',
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
