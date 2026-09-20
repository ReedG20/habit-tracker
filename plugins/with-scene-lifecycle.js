// Plain JS on purpose: `app.config.ts` is transpiled by Expo's loader, but the
// files it requires are not.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Adopts the UIScene life cycle, which the iOS 27 SDK requires: an app built
 * with Xcode 27 that still drives its window from the app delegate traps at
 * launch on iOS 27 (`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
 *
 * Expo SDK 57 ships `ExpoAppSceneDelegate` but its prebuild template does not
 * wire it up yet (SDK 58's does). This mirrors SDK 58's template: the scene
 * delegate creates the window and starts React Native, and the app delegate
 * only builds the factory and exposes it through `ExpoReactNativeFactoryProvider`.
 * Drop this plugin once the project is on an SDK whose template does this.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withSceneLifecycle = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            // Expo's base class, by its Objective-C name, so no Swift file has
            // to be added to the Xcode project.
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };

    return config;
  });

  config = withAppDelegate(config, (config) => {
    const { contents } = config.modResults;

    const conformance = 'class AppDelegate: ExpoAppDelegate {';
    const startBlock =
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

    if (!contents.includes(conformance) || !startBlock.test(contents)) {
      throw new Error(
        'with-scene-lifecycle: the generated AppDelegate.swift no longer matches the SDK 57 template; update the plugin or remove it.',
      );
    }

    config.modResults.contents = contents
      .replace(conformance, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
      .replace(
        startBlock,
        '    // The window is created and React Native is started by the scene delegate\n' +
          '    // under the scene-based life cycle (required by the iOS 27 SDK).\n',
      );

    return config;
  });

  return config;
};

module.exports = withSceneLifecycle;
