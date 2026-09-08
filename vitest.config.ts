import { defineConfig } from 'vitest/config';

export default defineConfig({
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
