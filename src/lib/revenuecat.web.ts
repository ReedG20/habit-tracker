// Type-only import: the SDK has no web build, and Metro must not bundle it here.
import type { CustomerInfo, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import type { ProOffering, PurchaseResult } from './revenuecat';

/** No store on web: the Pro row is hidden and every helper no-ops. */
export const PRO_ENTITLEMENT = 'ante_pro';
export const REENTRY_PRODUCT_ID = 'ante_reentry';
export const manageSubscriptionsUrl = 'https://apps.apple.com/account/subscriptions';
export const revenueCatSupported = false;
export const usingTestStore = false;

export function configureRevenueCat(): void {}

export async function logInRevenueCat(_userId: string): Promise<void> {}

export async function logOutRevenueCat(): Promise<void> {}

export function subscribeCustomerInfo(_listener: (info: CustomerInfo) => void): () => void {
  return () => {};
}

export function hasPro(_info: CustomerInfo | null): boolean {
  return false;
}

export async function loadProOffering(): Promise<ProOffering | null> {
  return null;
}

export async function checkTrialEligibility(_productId: string): Promise<boolean> {
  return false;
}

export async function purchasePackage(_pkg: PurchasesPackage): Promise<PurchaseResult> {
  throw new Error('Subscriptions are not available on web');
}

export async function loadReentryProduct(): Promise<PurchasesStoreProduct | null> {
  return null;
}

export async function purchaseReentry(_product: PurchasesStoreProduct): Promise<PurchaseResult> {
  throw new Error('In-app purchases are not available on web');
}

export async function restorePurchases(): Promise<CustomerInfo> {
  throw new Error('Subscriptions are not available on web');
}
