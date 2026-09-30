import { useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '@/convex/_generated/api';
import { shouldAutoPresentPaywall } from '@/data/daily-paywall';
import { useSubscription } from '@/hooks/use-subscription';
import { todayKey } from '@/lib/dates';
import { openPaywall } from '@/lib/paywall';
import { revenueCatSupported } from '@/lib/revenuecat';

const SHOWN_KEY = 'dailyPaywallShownDay';

let lastShownDay: string | null = readShownDay();

function readShownDay(): string | null {
  try {
    return SecureStore.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
}

function recordShown(day: string) {
  lastShownDay = day;
  try {
    SecureStore.setItem(SHOWN_KEY, day);
  } catch {
    // Only holds for this session then; still once, not on every screen change.
  }
}

/** Developer tool: forgets today's showing, so the next launch or return opens it. */
export function resetDailyPaywall() {
  lastShownDay = null;
  try {
    void SecureStore.deleteItemAsync(SHOWN_KEY);
  } catch {
    // Forgotten for this session regardless.
  }
}

/**
 * Without Ante Pro, opens the paywall the first time the app is opened each
 * day, from a cold start or back from the background. A lost stake's page,
 * or a Kept one, goes first; this waits until it's been answered.
 */
export function useDailyPaywall() {
  const subscription = useSubscription();
  const loss = useQuery(api.stakes.unseenLoss);
  const kept = useQuery(api.accomplishments.unseen);
  const pathname = usePathname();
  // Bumped each time the app comes to the front, so a new day is noticed.
  const [foregrounded, setForegrounded] = useState(0);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounded((count) => count + 1);
    });
    return () => listener.remove();
  }, []);

  // Wait for RevenueCat as well as Convex: right after a purchase only
  // RevenueCat knows, and a subscriber must never see this.
  const isLoading =
    subscription.isLoading || (revenueCatSupported && subscription.customerInfo === null);

  useEffect(() => {
    const today = todayKey();
    const show = shouldAutoPresentPaywall({
      today,
      lastShownDay,
      isPro: subscription.isPro,
      isLoading: isLoading || loss === undefined || kept === undefined,
      supported: revenueCatSupported,
      pathname,
      hasUnseenLoss: loss != null,
      hasUnseenKept: kept != null,
    });
    if (!show) return;
    // Recorded first, so a second run in the same moment can't open it twice.
    recordShown(today);
    openPaywall('daily');
  }, [subscription.isPro, isLoading, loss, kept, pathname, foregrounded]);
}
