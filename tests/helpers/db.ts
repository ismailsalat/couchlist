import { sql } from 'drizzle-orm';
import {
  IconRepository,
  AccountRepository,
  AuditRepository,
  AnimeAliasRepository,
  CollectionRepository,
  ContributionRepository,
  EntryRepository,
  FriendRepository,
  GuideRepository,
  GuildRepository,
  MediaCacheRepository,
  SourceDirectoryRepository,
  UserRepository,
  WatchSourceRepository,
  createDatabase,
  runMigrations,
  type Database,
  MirrorRepository,
  ToolsRepository,
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
    sql`truncate table blocked_domains, domain_reputation, blocklist_syncs, maintenance_runs, watch_source_domains, survey_responses, source_icons, source_collection_items, source_collections, guide_suggestions, source_revisions, source_contributions, guides, source_bookmarks, source_votes, auth_tokens, watch_source_reports, watch_source_health_votes, watch_source_ratings, server_watch_posts, media_watch_sources, watch_source_candidates, watch_sources, audit_logs, media_cache, anime_aliases, media_entries, friendships, guild_memberships, guild_settings, discord_guilds, sessions, users restart identity cascade`,
  );
}

export function repositories(db: Database) {
  return {
    accounts: new AccountRepository(db),
    sources: new SourceDirectoryRepository(db),
    contributions: new ContributionRepository(db),
    icons: new IconRepository(db),
    guides: new GuideRepository(db),
    collections: new CollectionRepository(db),
    users: new UserRepository(db),
    guilds: new GuildRepository(db),
    friends: new FriendRepository(db),
    entries: new EntryRepository(db),
    cache: new MediaCacheRepository(db),
    audit: new AuditRepository(db),
    animeAliases: new AnimeAliasRepository(db),
    watchSources: new WatchSourceRepository(db),
    mirrors: new MirrorRepository(db),
    tools: new ToolsRepository(db),
  };
}

let discordCounter = 100_000_000_000_000_000n;

/** Unique, realistic Discord snowflakes so tests never collide. */
export function nextDiscordId(): string {
  discordCounter += 1n;
  return discordCounter.toString();
}
