import type { ExpoConfig } from 'expo/config';

// Registered with Apple, Google (iOS OAuth client), and Clerk (Native
// Applications). Changing it means redoing all three.
const bundleIdentifier = 'com.useanteapp.ante';

const brandColor = '#4121FF';

const config: ExpoConfig = {
  name: 'Ante',
  slug: 'ante',
  // Pinned so EAS resolves the project the same way in CI as when signed in.
  owner: 'reedgrenager',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'ante',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier,
    // Icon Composer bundle (Liquid Glass; light/dark/tinted derive from it).
    // Rebuild the assets from assets/brand/*.svg if the mark changes.
    icon: './assets/ante.icon',
    // Pinned here because anything set in Xcode's UI is wiped by `expo prebuild
    // --clean`. Also stops `expo run:ios` from prompting for an identity.
    appleTeamId: 'QYZY3GZC8B',
    infoPlist: {
      // Only HTTPS, so exempt from export compliance; stops EAS asking each build.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleIdentifier,
    adaptiveIcon: {
      backgroundColor: brandColor,
      foregroundImage: './assets/images/android-icon-foreground.png',
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
        backgroundColor: brandColor,
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
      },
    ],
    '@clerk/expo',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        cameraPermission:
          'Allow $(PRODUCT_NAME) to use the camera to verify your habits and goals.',
        photosPermission: 'Allow $(PRODUCT_NAME) to access your photos.',
        // Images only; keeps NSMicrophoneUsageDescription out of the plist.
        microphonePermission: false,
      },
    ],
    '@clerk/expo-google-signin',
    'expo-apple-authentication',
    // Card entry for goal stakes. No Apple Pay yet, so no merchant identifier.
    ['@stripe/stripe-react-native', { enableGooglePay: false }],
    // UIScene adoption, required by the iOS 27 SDK; see the plugin for details.
    './plugins/with-scene-lifecycle.js',
  ],
  updates: {
    url: 'https://u.expo.dev/d5f78f95-028f-41ed-bbe2-777ce72ac974',
  },
  // Hash of everything native (deps, plugins, SDK), so an OTA update can only
  // reach builds it is actually compatible with. A native change means a new
  // build; `eas update` refuses to publish to a runtime with no builds.
  runtimeVersion: {
    policy: 'fingerprint',
  },
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
