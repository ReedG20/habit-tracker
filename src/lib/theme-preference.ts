import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'themePreference';

const listeners = new Set<() => void>();
let current: ThemePreference = 'system';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function read(): ThemePreference {
  try {
    const stored =
      Platform.OS === 'web'
        ? globalThis.localStorage?.getItem(STORAGE_KEY)
        : SecureStore.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function write(preference: ThemePreference) {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, preference);
    } else {
      SecureStore.setItem(STORAGE_KEY, preference);
    }
  } catch (error) {
    console.error('Failed to save the theme preference', error);
  }
}

/**
 * `Appearance.setColorScheme` overrides the whole app, native views included
 * (UIKit's `overrideUserInterfaceStyle`), and `useColorScheme` follows it, so
 * nothing downstream needs to know a preference exists. React Native Web has
 * no such override; the web `useColorScheme` reads the preference instead.
 */
function apply(preference: ThemePreference) {
  // Missing on web, including the static server render.
  if (typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/**
 * Applies the saved preference. Called at module scope in the root layout so
 * the first frame already renders in the right scheme.
 */
export function loadThemePreference() {
  current = read();
  apply(current);
}

export function setThemePreference(preference: ThemePreference) {
  current = preference;
  apply(preference);
  write(preference);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => current);
}
