import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';
import pg from 'pg';
import { loadProjectEnv } from './load-env.js';

/**
 * Migration runner.
 *
 * Applies pending migrations forward only. There is deliberately no reset or
 * drop path here - production data is never wiped by a deploy.
 */
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(here, '..', 'migrations');

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ...(/localhost|127\.0\.0\.1/.test(connectionString)
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  loadProjectEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set. Cannot run migrations.\n\n');
    process.exit(1);
  }

  process.stdout.write(`Applying migrations from ${MIGRATIONS_FOLDER}\n`);
  try {
    await runMigrations(url);
    process.stdout.write('Migrations applied.\n');
  } catch (error) {
    process.stderr.write(`\nMigration failed: ${(error as Error).message}\n\n`);
    process.exit(1);
  }
}

// Only run when invoked directly, so importing this file in tests is safe.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}

export { createDatabase, MIGRATIONS_FOLDER };
