import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';

import { track } from '@/lib/analytics';

/**
 * Whether the user has allowed what they write and submit to go to the AI
 * model (Google Gemini, through OpenRouter) that suggests ideas and checks
 * proof. App Review 5.1.2(i) wants explicit permission before personal data
 * goes to a third-party AI, so nothing is sent until they say yes. Kept on the
 * device: a reinstall asks again, which is fine.
 */
export type AiConsent = 'granted' | 'declined';

const STORAGE_KEY = 'aiConsent';

const listeners = new Set<() => void>();
let current: AiConsent | null = read();

function read(): AiConsent | null {
  try {
    const stored =
      Platform.OS === 'web'
        ? globalThis.localStorage?.getItem(STORAGE_KEY)
        : SecureStore.getItem(STORAGE_KEY);
    return stored === 'granted' || stored === 'declined' ? stored : null;
  } catch {
    return null;
  }
}

export function setAiConsent(consent: AiConsent) {
  current = consent;
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, consent);
    } else {
      SecureStore.setItem(STORAGE_KEY, consent);
    }
  } catch (error) {
    console.error('Failed to save the AI consent', error);
  }
  listeners.forEach((listener) => listener());
}

export function hasAiConsent(): boolean {
  return current === 'granted';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAiConsent(): AiConsent | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

const WHAT_IS_SENT =
  'Ante sends the names of your habits and goals, the photos you submit as proof, and the places near you when you check in to Google’s Gemini AI, through OpenRouter. It’s used only to suggest proof ideas and to check your proof, never for ads.';

/**
 * Resolves whether AI may be used, asking first if it hasn't been answered.
 * For `ideas` (a nice-to-have while making a commitment), a past "Not now" is
 * respected without asking again. For `proof`, which can't be checked
 * without it, a past "Not now" is asked again.
 */
export function ensureAiConsent(purpose: 'ideas' | 'proof'): Promise<boolean> {
  if (current === 'granted') return Promise.resolve(true);
  if (current === 'declined' && purpose === 'ideas') return Promise.resolve(false);

  return new Promise((resolve) => {
    const answer = (consent: AiConsent) => {
      setAiConsent(consent);
      track('ai consent answered', { consent, purpose });
      resolve(consent === 'granted');
    };
    Alert.alert(
      purpose === 'proof' ? 'Let AI check your proof?' : 'Use AI to help?',
      purpose === 'proof'
        ? `${WHAT_IS_SENT}\n\nPhoto and location proof can’t be checked without it. You can change this any time in Me → Preferences.`
        : `${WHAT_IS_SENT}\n\nYou can change this any time in Me → Preferences.`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => answer('declined') },
        { text: 'Allow', onPress: () => answer('granted') },
      ],
      { cancelable: false },
    );
  });
}
