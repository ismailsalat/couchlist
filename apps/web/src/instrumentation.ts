/**
 * Server startup and shutdown.
 *
 * Next.js calls `register()` once when the server process starts. This is where
 * Couchlist logs its configuration and installs signal handlers, so a Railway
 * redeploy closes the PostgreSQL pool instead of dropping connections.
 */
export async function register(): Promise<void> {
  // Only the Node.js runtime has signals and a database pool.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { createLogger, parseEnvironment, safeConfigSummary, testModeStatus, validateConfig } =
    await import('@couchlist/shared');

  const config = parseEnvironment();
  const log = createLogger({
    service: 'web',
    level: config.LOG_LEVEL,
    json: config.LOG_JSON,
  });

  const problems = validateConfig(config, 'web');
  if (problems.length > 0) {
    // Warn rather than exit: the build also runs this, and failing there would
    // block a deploy for configuration that is supplied at runtime.
    log.warn('configuration_incomplete', { problems });
  }

  log.info('WEB_START', safeConfigSummary(config));

  const test = testModeStatus(config);
  if (test.enabled) {
    // Counts only - never the IDs themselves.
    log.warn('TEST MODE ENABLED', {
      allowedGuilds: test.allowedGuilds,
      allowedUsers: test.allowedUsers,
    });
  }
  if (config.ALLOW_DEV_LOGIN) {
    log.warn('dev_login_enabled', { environment: config.ENVIRONMENT });
  }

  // The PostgreSQL pool installs its own shutdown handler in lib/db.ts, which
  // is Node-only and so can safely import the driver.
}
