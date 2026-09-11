import type { CouchlistConfig } from '@couchlist/shared';
import type {
  AuditRepository,
  Database,
  EntryRepository,
  FriendRepository,
  GuildRepository,
  UserRepository,
  WatchSourceRepository,
} from '@couchlist/db';
import type { Logger } from '@couchlist/shared';

/**
 * Everything a command needs, passed in explicitly.
 *
 * No module-level singletons, which is what makes commands testable without a
 * live Discord connection.
 */
export interface BotContext {
  config: CouchlistConfig;
  log: Logger;
  db: Database;
  users: UserRepository;
  guilds: GuildRepository;
  entries: EntryRepository;
  friends: FriendRepository;
  audit: AuditRepository;
  watchSources: WatchSourceRepository;
  startedAt: Date;
}
