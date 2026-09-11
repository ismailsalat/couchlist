import 'server-only';
import {
  AuditRepository,
  AnimeAliasRepository,
  EntryRepository,
  FriendRepository,
  GuildRepository,
  MediaCacheRepository,
  UserRepository,
  WatchSourceRepository,
  closeDatabase,
  getDatabase,
  type Database,
} from '@couchlist/db';
import { config } from './config';

let repositories: Repositories | undefined;
let shutdownRegistered = false;

/**
 * Close the pool on shutdown.
 *
 * Registered here rather than in instrumentation.ts because this module is
 * Node-only; instrumentation is compiled for the edge runtime as well, which
 * cannot bundle the PostgreSQL driver.
 */
function registerShutdown(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    try {
      await closeDatabase();
    } finally {
      process.stdout.write(`web shutdown complete (${signal})\n`);
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

export interface Repositories {
  db: Database;
  users: UserRepository;
  guilds: GuildRepository;
  friends: FriendRepository;
  entries: EntryRepository;
  cache: MediaCacheRepository;
  audit: AuditRepository;
  animeAliases: AnimeAliasRepository;
  watchSources: WatchSourceRepository;
}

/** One set of repositories per process, created on first use. */
export function repos(): Repositories {
  if (repositories) return repositories;

  const db = getDatabase(config().DATABASE_URL);
  registerShutdown();
  repositories = {
    db,
    users: new UserRepository(db),
    guilds: new GuildRepository(db),
    friends: new FriendRepository(db),
    entries: new EntryRepository(db),
    cache: new MediaCacheRepository(db),
    audit: new AuditRepository(db),
    animeAliases: new AnimeAliasRepository(db),
    watchSources: new WatchSourceRepository(db),
  };
  return repositories;
}
