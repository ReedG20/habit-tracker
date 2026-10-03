import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Alert, InteractionManager, Keyboard, Platform } from 'react-native';

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
/** Past a modal's slide-in, so the alert isn't laid out mid-transition. */
const ALERT_DELAY_MS = 350;

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
  // Unanswered in memory may still be answered on disk (read before it was saved).
  if (current === null) current = read();
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
  'Ante sends your habit and goal names, proof photos and check-in places to Google’s Gemini AI, through OpenRouter, to suggest ideas and check proof. Never for ads.';

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
    // After the screen's own transition settles and with the keyboard down:
    // an alert shown mid-animation, or while a field grabs focus, is sized for
    // the keyboard and stays tall and mostly empty.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        Keyboard.dismiss();
        Alert.alert(
          purpose === 'proof' ? 'Let AI check your proof?' : 'Use AI to help?',
          purpose === 'proof'
            ? `${WHAT_IS_SENT} Photo and location proof can’t be checked without it. Change it in Me → Preferences.`
            : `${WHAT_IS_SENT} Change it in Me → Preferences.`,
          [
            { text: 'Not now', style: 'cancel', onPress: () => answer('declined') },
            { text: 'Allow', onPress: () => answer('granted') },
          ],
          { cancelable: false },
        );
      }, ALERT_DELAY_MS);
    });
  });
}
