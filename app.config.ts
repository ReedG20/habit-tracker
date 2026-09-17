import type { ExpoConfig } from 'expo/config';

// TODO: confirm before registering with Apple, Google, or Clerk — changing the
// bundle identifier afterwards means redoing that setup.
const bundleIdentifier = 'us.studyspot.habittracker';

const config: ExpoConfig = {
  name: 'habit-tracker',
  slug: 'habit-tracker',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'habittracker',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier,
    icon: './assets/expo.icon',
    // Pinned here because anything set in Xcode's UI is wiped by `expo prebuild
    // --clean`. Also stops `expo run:ios` from prompting for an identity.
    appleTeamId: 'QYZY3GZC8B',
  },
  android: {
    package: bundleIdentifier,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    '@clerk/expo',
    'expo-secure-store',
    '@clerk/expo-google-signin',
    'expo-apple-authentication',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // Clerk reads these from `extra` rather than `process.env` for any non-dev
  // bundle. There is no Android client ID: on Android, Google identifies the app
  // by package name and signing fingerprint, and the token audience stays the
  // web client ID.
  extra: {
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
  },
};

export default config;
