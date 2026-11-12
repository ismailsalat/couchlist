import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests.
 *
 * They create a real account and verify it with the code the development mail
 * transport returns, so the suite needs neither a mailbox nor a live provider.
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
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      /*
       * The extension spec launches its own browser with the extension
       * loaded, so a phone profile would neither change what it tests nor
       * be able to run it — Chrome extensions are desktop only.
       */
      testIgnore: /extension\.spec\.ts/u,
    },
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
          // Prints verification codes to the log and returns them in the
          // response, which is how the suite completes a signup.
          MAIL_TRANSPORT: 'log',
          ALLOW_DEV_LOGIN: 'false',
          // The maintenance schedule would otherwise fire 60 seconds into a
          // run and rewrite the health data the status tests assert on,
          // which is a flaky suite waiting to happen.
          MAINTENANCE_IN_PROCESS: 'false',
          // Every request comes from one address, so the production
          // per-address limits would reject the suite's own signups.
          RATE_LIMIT_SIGNUP_PER_MINUTE: '10000',
          RATE_LIMIT_LOGIN_PER_MINUTE: '10000',
          // One fixed address is promoted on sign-in, so the suite can reach
          // the moderation pages without a second mechanism for granting it.
          ADMIN_EMAILS: 'e2e-admin@example.test',
          // Only forwarded when the shell already has one. A hardcoded
          // fallback here would override the password in the project's .env
          // and fail on any machine whose Postgres wants one.
          ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
        },
      },
});
