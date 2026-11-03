import 'server-only';
import {
  AccountRepository,
  AuditRepository,
  CollectionRepository,
  ContributionRepository,
  GuideRepository,
  IconRepository,
  MirrorRepository,
  SourceDirectoryRepository,
  StatisticsRepository,
  SurveyRepository,
  UserRepository,
  WatchSourceRepository,
  closeDatabase,
  getDatabase,
  type Database,
  ToolsRepository,
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

  /** Email accounts, verification codes and reset tokens. */
  accounts: AccountRepository;
  /** The public source directory: listing, ranking, votes and bookmarks. */
  sources: SourceDirectoryRepository;
  /** Suggestions, corrections, reports and contributor credit. */
  contributions: ContributionRepository;
  guides: GuideRepository;
  /** Counts for the public statistics page. */
  statistics: StatisticsRepository;
  /** The one-question survey. */
  survey: SurveyRepository;
  /** The addresses a listing answers on. */
  mirrors: MirrorRepository;
  /** Site icons: the bytes, kept out of every listing query. */
  icons: IconRepository;
  collections: CollectionRepository;
  audit: AuditRepository;
  /** Blocklists, cached reputation and sync history, for the tools. */
  tools: ToolsRepository;

  /**
   * Legacy repositories.
   *
   * `users` still serves accounts created through Discord before the rebuild;
   * `watchSources` is retained for the source importer. Neither is on a path
   * that signs anybody in.
   */
  users: UserRepository;
  watchSources: WatchSourceRepository;
}

/** One set of repositories per process, created on first use. */
export function repos(): Repositories {
  if (repositories) return repositories;

  const db = getDatabase(config().DATABASE_URL);
  registerShutdown();
  repositories = {
    db,
    accounts: new AccountRepository(db),
    sources: new SourceDirectoryRepository(db),
    contributions: new ContributionRepository(db),
    guides: new GuideRepository(db),
    statistics: new StatisticsRepository(db),
    survey: new SurveyRepository(db),
    mirrors: new MirrorRepository(db),
    icons: new IconRepository(db),
    collections: new CollectionRepository(db),
    audit: new AuditRepository(db),
    users: new UserRepository(db),
    watchSources: new WatchSourceRepository(db),
    tools: new ToolsRepository(db),
  };
  return repositories;
}
