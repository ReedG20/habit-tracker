import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Where people reach a person at Ante, and the legal pages. Contested charges
 * go through the app (`/contest/[stakeId]`); everything else is an email.
 */

export const SUPPORT_EMAIL = 'support@useanteapp.com';
export const TERMS_URL = 'https://useanteapp.com/terms';
export const PRIVACY_URL = 'https://useanteapp.com/privacy';

/** "1.0.0 (42) · update 01a0b759", so support knows which code they're hearing about. */
function describeApp(): string {
  const version = `${Constants.expoConfig?.version ?? '?'} (${Application.nativeBuildVersion ?? '?'})`;
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || Updates.updateId === null) return version;
  return `${version} · update ${Updates.updateId.slice(0, 8)}`;
}

/**
 * Opens a new email to support, with the details we'd otherwise have to ask
 * for under the space to write. Without a mail app (the simulator, or someone
 * who deleted Mail), it says where to write instead.
 */
export async function contactSupport(
  options: { subject?: string; stakeId?: string } = {},
): Promise<void> {
  const details = [
    `Ante ${describeApp()}`,
    `${Platform.OS === 'ios' ? 'iOS' : Platform.OS} ${String(Platform.Version)}`,
  ];
  if (options.stakeId !== undefined) details.push(`Charge ${options.stakeId}`);
  const body = `\n\n\n—\n${details.join('\n')}`;
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(options.subject ?? 'Help with Ante')}&body=${encodeURIComponent(body)}`;

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Email us', `Write to ${SUPPORT_EMAIL} and a person will get back to you.`);
  }
}
