import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Convex functions run under convex-test in an edge-like runtime; the app's own
// pure helpers can share the same runner.
export default defineConfig({
  // Mirror tsconfig's `paths`, so `src/` tests can import the app's own modules.
  resolve: {
    alias: [
      { find: /^@\/convex\/(.*)$/, replacement: `${root('./convex')}/$1` },
      { find: /^@\/assets\/(.*)$/, replacement: `${root('./assets')}/$1` },
      { find: /^@\/(.*)$/, replacement: `${root('./src')}/$1` },
    ],
  },
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
