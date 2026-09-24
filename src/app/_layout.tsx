import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { StripeProvider } from '@/components/stripe-provider';
import { wisdomFontFamily } from '@/constants/custom-fonts';
import { sheetScreenOptions } from '@/constants/sheet-screen-options';
import { configureRevenueCat } from '@/lib/revenuecat';
import { loadThemePreference } from '@/lib/theme-preference';

SplashScreen.preventAutoHideAsync();

// These have to be static property reads: Expo inlines `process.env.EXPO_PUBLIC_*`
// at build time, so a computed key would be undefined in a bundle.
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';

if (!publishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — in .env.local for dev, or the EAS environment for builds (see .env.example)',
  );
}

if (!convexUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_CONVEX_URL — run `bunx convex dev` for dev, or set it in the EAS environment for builds',
  );
}

const convex = new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });

// At module scope rather than in an effect: child effects run before parent
// effects, so the authenticated layout's `logIn` would otherwise beat `configure`.
configureRevenueCat();

// Before the first render, so a forced light or dark scheme never flashes the system one.
loadThemePreference();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    [wisdomFontFamily]: require('@/assets/fonts/Comico-Regular.otf'),
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Clerk has to be the outer provider so Convex can read its auth context.
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <StripeProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
          </ThemeProvider>
        </StripeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function RootNavigator() {
  // `useConvexAuth` rather than Clerk's `useAuth`: it only reports authenticated
  // once Convex itself has validated the token, so authenticated screens never
  // mount before their queries can resolve.
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Hold the splash screen rather than flashing sign-in at someone whose
  // session is still being restored from SecureStore.
  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
        {/* In the root stack so it can open over the tab bar from any tab. */}
        <Stack.Screen
          name="pro"
          // Taller than the form sheets: two plan cards plus the legal line.
          options={{ ...sheetScreenOptions, sheetAllowedDetents: [0.9] }}
        />
        <Stack.Screen
          name="preferences"
          options={{ ...sheetScreenOptions, sheetAllowedDetents: [0.22] }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
