import type { ExpoConfig } from 'expo/config';

// Registered with Apple, Google (iOS OAuth client), and Clerk (Native
// Applications). Changing it means redoing all three.
const bundleIdentifier = 'com.useanteapp.ante';

const config: ExpoConfig = {
  name: 'Ante',
  slug: 'ante',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'ante',
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
    [
      'expo-image-picker',
      {
        cameraPermission: 'Allow $(PRODUCT_NAME) to use the camera to verify your habits.',
        photosPermission: 'Allow $(PRODUCT_NAME) to access your photos.',
        // Images only; keeps NSMicrophoneUsageDescription out of the plist.
        microphonePermission: false,
      },
    ],
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
    eas: {
      projectId: 'd5f78f95-028f-41ed-bbe2-777ce72ac974',
    },
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
  },
};

export default config;
