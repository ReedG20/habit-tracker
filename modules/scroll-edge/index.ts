import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

export type ScrollEdgeContainerProps = ViewProps & {
  /** The scroll view's edge this sits over. */
  edge?: 'top' | 'bottom';
  /** `soft` fades and blurs; `hard` is a crisp divider, for dense content. */
  effectStyle?: 'automatic' | 'soft' | 'hard';
};

const nativeModule = requireOptionalNativeModule('ScrollEdge');

/**
 * Whether this build carries the native view and the OS draws scroll edge
 * effects (iOS 26+). False in Expo Go, on Android, and in a JS update running
 * on a binary from before the module existed.
 */
export const isScrollEdgeAvailable =
  nativeModule !== null &&
  Platform.OS === 'ios' &&
  Number.parseInt(String(Platform.Version), 10) >= 26;

/** Only render when `isScrollEdgeAvailable`. */
export const ScrollEdgeContainer: ComponentType<ScrollEdgeContainerProps> | null =
  nativeModule === null ? null : requireNativeView('ScrollEdge');
