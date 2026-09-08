import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests.
 *
 * They sign in through the development login rather than live Discord OAuth,
 * so the suite runs without touching discord.com.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run start --workspace @couchlist/web',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
          ENVIRONMENT: 'development',
          ALLOW_DEV_LOGIN: 'true',
          DATABASE_URL:
            process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5432/couchlist',
        },
      },
});
