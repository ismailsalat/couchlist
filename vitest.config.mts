import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The web app's own path alias, so a test can exercise a server module
      // directly instead of only through HTTP.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      // Next's marker package throws outside a server bundle. The modules it
      // guards are the ones these tests are for, so it is stubbed away.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    globals: false,
    setupFiles: ['tests/setup-env.ts'],
    // Integration suites share one disposable PostgreSQL database. Running
    // test files in parallel can make one suite reset/migrate while another
    // is using it, which causes flaky enum/table errors. Keep files serial;
    // individual tests remain fast and deterministic.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
