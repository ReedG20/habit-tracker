// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const convexPlugin = require('@convex-dev/eslint-plugin');

// The plugin still ships an eslintrc-style config, so lift its recommended
// rules (scoped to the convex directory) into flat config by hand.
const convexRules = convexPlugin.configs.recommended.overrides[0].rules;

module.exports = defineConfig([
  expoConfig,
  {
    files: ['convex/**/*.ts'],
    plugins: { '@convex-dev': convexPlugin },
    rules: convexRules,
  },
  {
    ignores: ['dist/*', 'convex/_generated/*'],
  },
]);
