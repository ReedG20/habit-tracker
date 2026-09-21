import { defineConfig } from 'vitest/config';

// Convex functions run under convex-test in an edge-like runtime; the app's own
// pure helpers can share the same runner.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
