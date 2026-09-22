import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

// Static property reads: Expo inlines `process.env.EXPO_PUBLIC_*` at build
// time, so a computed key would be undefined in a bundle.
const storeKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  // No Play Store setup yet; everything below no-ops on Android until there is.
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
});

/**
 * RevenueCat's Test Store: a hosted stand-in for the real store whose
 * purchases work in the simulator with no App Store Connect products, so the
 * paywall can be built before anything is "Ready to Submit". Its purchase
 * sheet offers success / failure / cancel buttons, and it produces the same
 * entitlements and webhooks as the real thing.
 *
 * Honoured only in a debug build, so a preview or production build always
 * talks to the real store however its environment is configured. Set it in
 * `.env.local` only — never in an EAS environment.
 */
const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

export const usingTestStore = __DEV__ && testKey !== undefined && testKey !== '';

const apiKey = usingTestStore ? testKey : storeKey;

if (Platform.OS === 'ios' && !apiKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_REVENUECAT_IOS_API_KEY — in .env.local for dev, or the EAS environment for builds (see .env.example)',
  );
}

/** The RevenueCat entitlement every Ante Pro product is attached to. */
export const PRO_ENTITLEMENT = 'ante_pro';

/** Where the user manages or cancels the subscription; Apple owns that screen. */
export const manageSubscriptionsUrl = 'https://apps.apple.com/account/subscriptions';

/** `false` where no store is configured (Android for now); the helpers then no-op. */
export const revenueCatSupported = apiKey !== undefined;

export type ProOffering = { monthly: PurchasesPackage; annual: PurchasesPackage };

export type PurchaseResult =
  { kind: 'purchased'; customerInfo: CustomerInfo } | { kind: 'cancelled' };

let configured = false;

/**
 * Starts the SDK anonymously; `logInRevenueCat` attaches our user id once the
 * `users` row exists. Guarded so a Fast Refresh re-import cannot configure twice.
 */
export function configureRevenueCat(): void {
  if (!revenueCatSupported || configured) return;
  configured = true;
  if (__DEV__) {
    void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    // Which store the prices on the paywall are coming from.
    console.log(`RevenueCat configured against the ${usingTestStore ? 'Test' : 'App'} Store`);
  }
  Purchases.configure({ apiKey: apiKey! });
}

/** Ties the device's purchases to `userId` (our `users._id`), merging any anonymous ones. */
export async function logInRevenueCat(userId: string): Promise<void> {
  if (!revenueCatSupported) return;
  try {
    await Purchases.logIn(userId);
  } catch (error: unknown) {
    console.error('RevenueCat logIn failed', error);
  }
}

/** Back to an anonymous customer, so the next sign-in cannot inherit this user's subscription. */
export async function logOutRevenueCat(): Promise<void> {
  if (!revenueCatSupported) return;
  try {
    if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut();
    }
  } catch (error: unknown) {
    console.error('RevenueCat logOut failed', error);
  }
}

/**
 * Calls `listener` with the current CustomerInfo and again whenever the SDK
 * learns of a change (a purchase, a renewal, a login). Returns the unsubscribe.
 */
export function subscribeCustomerInfo(listener: (info: CustomerInfo) => void): () => void {
  if (!revenueCatSupported) return () => {};
  Purchases.getCustomerInfo()
    .then(listener)
    .catch((error: unknown) => console.warn('RevenueCat getCustomerInfo failed', error));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export function hasPro(info: CustomerInfo | null): boolean {
  return info?.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

/** The current offering's monthly and annual packages, or `null` if either is missing (offline, products not live yet). */
export async function loadProOffering(): Promise<ProOffering | null> {
  if (!revenueCatSupported) return null;
  const offerings = await Purchases.getOfferings();
  const monthly = offerings.current?.monthly;
  const annual = offerings.current?.annual;
  if (!monthly || !annual) return null;
  return { monthly, annual };
}

/**
 * Whether Apple will grant `productId`'s introductory offer to this user.
 * Unknown counts as ineligible so the button never promises a trial the store
 * then refuses; Apple's own sheet is the final word either way.
 */
export async function checkTrialEligibility(productId: string): Promise<boolean> {
  if (!revenueCatSupported) return false;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility([productId]);
    return (
      result[productId]?.status ===
      Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
    );
  } catch (error: unknown) {
    console.warn('RevenueCat eligibility check failed', error);
    return false;
  }
}

/** Runs the store purchase sheet. Throws on anything other than the user backing out. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { kind: 'purchased', customerInfo };
  } catch (error: unknown) {
    if (isPurchasesError(error) && error.userCancelled) {
      return { kind: 'cancelled' };
    }
    throw error;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return await Purchases.restorePurchases();
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return typeof error === 'object' && error !== null && 'userCancelled' in error;
}
