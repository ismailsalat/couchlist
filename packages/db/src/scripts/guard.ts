import { parseEnvironment } from '@couchlist/shared';

/**
 * Destructive-operation guard.
 *
 * Seeding and resetting exist for local development only. Rather than trusting
 * a developer to remember, these refuse to run unless the environment is
 * explicitly development or test.
 */
export function assertNotProduction(operation: string): void {
  const config = parseEnvironment();
  const allowed = config.ENVIRONMENT === 'development' || config.ENVIRONMENT === 'test';

  if (!allowed) {
    process.stderr.write(
      `\nRefusing to ${operation}: ENVIRONMENT is "${config.ENVIRONMENT}".\n` +
        'This command only runs with ENVIRONMENT=development or test.\n\n',
    );
    process.exit(1);
  }

  // A production-looking database URL is a second, independent signal.
  const url = config.DATABASE_URL;
  if (/railway|amazonaws|supabase|neon\.tech|render\.com/i.test(url)) {
    process.stderr.write(
      `\nRefusing to ${operation}: DATABASE_URL looks like a hosted production database.\n\n`,
    );
    process.exit(1);
  }

  return;
}
