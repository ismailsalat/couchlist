import { sql } from 'drizzle-orm';
import {
  AuditRepository,
  EntryRepository,
  FriendRepository,
  GuildRepository,
  MediaCacheRepository,
  UserRepository,
  createDatabase,
  runMigrations,
  type Database,
} from '@couchlist/db';

/**
 * Integration test harness.
 *
 * These tests run against a real PostgreSQL database, so constraints, indexes
 * and transactions are genuinely exercised rather than simulated.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/couchlist_test';

let database: Database | undefined;

export async function setupTestDatabase(): Promise<Database> {
  if (!database) {
    await runMigrations(TEST_DATABASE_URL);
    database = createDatabase({ connectionString: TEST_DATABASE_URL, ssl: false });
  }
  return database;
}

/** Wipes every table between tests. Order does not matter with CASCADE. */
export async function resetTables(db: Database): Promise<void> {
  await db.execute(
    sql`truncate table audit_logs, media_cache, media_entries, friendships, guild_memberships, guild_settings, discord_guilds, sessions, users restart identity cascade`,
  );
}

export function repositories(db: Database) {
  return {
    users: new UserRepository(db),
    guilds: new GuildRepository(db),
    friends: new FriendRepository(db),
    entries: new EntryRepository(db),
    cache: new MediaCacheRepository(db),
    audit: new AuditRepository(db),
  };
}

let discordCounter = 100_000_000_000_000_000n;

/** Unique, realistic Discord snowflakes so tests never collide. */
export function nextDiscordId(): string {
  discordCounter += 1n;
  return discordCounter.toString();
}
