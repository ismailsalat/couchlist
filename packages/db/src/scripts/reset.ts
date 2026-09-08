import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { assertNotProduction } from './guard.js';
import { loadProjectEnv } from '../load-env.js';

/**
 * Development reset.
 *
 * Empties every table. Guarded the same way as the seed: production refuses.
 */
export async function reset(connectionString: string): Promise<void> {
  const db = createDatabase({ connectionString, ssl: false });

  await db.execute(
    sql`truncate table audit_logs, media_cache, media_entries, friendships, guild_memberships, guild_settings, discord_guilds, sessions, users restart identity cascade`,
  );

  process.stdout.write('\nCouchlist database emptied.\n\n');
}

async function main(): Promise<void> {
  loadProjectEnv();
  assertNotProduction('reset the database');

  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set.\n\n');
    process.exit(1);
  }

  await reset(url);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
