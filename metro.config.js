// Expo's default Metro config, plus PostHog's serializer: it stamps each bundle
// with an id that ties it to the source map uploaded for it, so error-tracking
// stack traces resolve to real files and lines.
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

module.exports = getPostHogExpoConfig(__dirname);
