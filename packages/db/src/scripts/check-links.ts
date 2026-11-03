import { and, eq, sql } from 'drizzle-orm';
import {
  checkSourceHealth,
  countsAsFailure,
  createLogger,
  parseExternalUrl,
  type HealthFetch,
} from '@couchlist/shared';
import { closeDatabase, getDatabase } from '../client.js';
import { watchSources } from '../schema.js';
import { MirrorRepository } from '../repositories/mirrors.js';
import { SourceDirectoryRepository } from '../repositories/sources.js';
import { loadProjectEnv } from '../load-env.js';

/**
 * Checks that listed sources still answer.
 *
 * Run on a schedule. A directory of links rots quietly: sites in this corner
 * of the web move and disappear often, and without this nothing notices until
 * somebody reports it, by which time the listing has been wrong for weeks.
 *
 * Deliberately modest. It takes the least recently checked sources, asks each
 * one politely whether it is there, and writes down the answer. It changes
 * nothing a reader sees — three consecutive failures put a source in front of
 * a moderator, and a person decides. An automatic hide would mean one bad
 * afternoon on someone else's server could remove a good listing.
 *
 *   npm run check:links                 the default batch
 *   npm run check:links -- --limit 200  a bigger pass
 *   npm run check:links -- --all        everything, ignoring when it was last done
 */

loadProjectEnv();

const logger = createLogger({ service: 'links' });

const DEFAULT_LIMIT = 100;
/** Requests in flight at once. Small on purpose: this is not a crawler. */
const CONCURRENCY = 4;

/** How long a deleted listing can still be restored before it is removed. */
const RESTORE_WINDOW_DAYS = 30;
const TIMEOUT_MS = 10_000;

/**
 * A plain, honest user agent.
 *
 * Saying who this is and why gives an operator something to look up, and a
 * way to block us that does not involve guessing. Pretending to be a browser
 * would get through more often and would be a lie told to somebody else's
 * server.
 */
const USER_AGENT =
  'CouchlistLinkCheck/1.0 (+link availability check; one HEAD request per week)';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const realFetch: HealthFetch = (url, init) =>
  fetch(url, {
    ...init,
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
  });

/**
 * One pass of the link check, callable.
 *
 * Exported so the combined maintenance run reuses this rather than keeping a
 * second copy of the rules, which is how two jobs quietly start disagreeing
 * about what counts as a failure.
 */
export async function runLinkCheck(
  options: { limit?: number; all?: boolean } = {},
): Promise<void> {
  const db = getDatabase();
  const mirrors = new MirrorRepository(db);
  const sources = new SourceDirectoryRepository(db);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const all = options.all ?? false;

  const due = await db
    .select({
      id: watchSources.id,
      name: watchSources.name,
      domain: watchSources.domain,
      homepageUrl: watchSources.homepageUrl,
      failures: watchSources.healthFailures,
    })
    .from(watchSources)
    .where(
      all
        ? and(eq(watchSources.isEnabled, true), sql`${watchSources.deletedAt} is null`)
        : and(
            eq(watchSources.isEnabled, true),
            sql`${watchSources.deletedAt} is null`,
            // Nulls first: a source never checked is the most overdue there is.
            sql`(${watchSources.lastHealthCheckAt} is null
                 or ${watchSources.lastHealthCheckAt} < now() - interval '6 days')`,
          ),
    )
    // `asc` has to be inside the fragment: nulls-first follows the
    // direction in SQL, and Drizzle's asc() would append it afterwards.
    .orderBy(sql`${watchSources.lastHealthCheckAt} asc nulls first`)
    .limit(limit);

  if (due.length === 0) {
    logger.info('nothing_due');
    return;
  }

  logger.info('checking', { count: due.length });

  let ok = 0;
  let failed = 0;
  let flagged = 0;

  // A small worker pool rather than Promise.all over everything: a hundred
  // simultaneous requests is rude and tells us nothing extra.
  const queue = [...due];
  async function worker(): Promise<void> {
    for (;;) {
      const source = queue.shift();
      if (!source) return;

      const outcome = await checkSourceHealth(source.homepageUrl, realFetch, {
        timeoutMs: TIMEOUT_MS,
      });
      const failure = countsAsFailure(outcome.status);
      const failures = failure ? source.failures + 1 : 0;

      await db
        .update(watchSources)
        .set({
          lastHealthCheckAt: new Date(),
          healthStatus: outcome.status,
          healthStatusCode: outcome.statusCode ?? null,
          healthDetail: outcome.detail ?? null,
          healthFailures: failures,
          updatedAt: new Date(),
        })
        .where(eq(watchSources.id, source.id));

      /*
       * A site that redirects somewhere else has usually moved, and the
       * address it moved to is the single most useful thing this job can
       * find. It is recorded as a proposal, never accepted: the site being
       * checked chooses where its redirect points, so taking it at its word
       * would let any listed site write its own addresses into the directory.
       */
      if (outcome.status === 'MOVED' && outcome.finalUrl) {
        try {
          const moved = parseExternalUrl(outcome.finalUrl);
          if (moved && moved.domain !== source.domain) {
            await mirrors.add({
              sourceId: source.id,
              domain: moved.domain,
              homepageUrl: moved.url.toString(),
              isConfirmed: false,
              note: `Seen as a redirect from ${source.domain}`,
            });
          }
        } catch {
          // A proposal is a convenience. It never fails the check.
        }
      }

      if (failure) {
        failed += 1;
        if (failures >= 3) flagged += 1;
        logger.warn('source_unhealthy', {
          domain: source.domain,
          status: outcome.status,
          code: outcome.statusCode,
          failures,
        });
      } else {
        ok += 1;
        if (outcome.status !== 'OK') {
          logger.warn('source_needs_a_look', {
            domain: source.domain,
            status: outcome.status,
            detail: outcome.detail,
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  /*
   * Empty the bin on the way out.
   *
   * A thirty-day undo window only means something if something eventually
   * removes what is past it; otherwise it is a bin nobody empties, which is
   * just hoarding with extra steps. This job already runs weekly, so it is
   * the natural place rather than a second schedule to forget about.
   */
  try {
    const purged = await sources.purgeDeletedBefore(
      new Date(Date.now() - RESTORE_WINDOW_DAYS * 86_400_000),
    );
    if (purged > 0) logger.info('purged_deleted', { count: purged, afterDays: RESTORE_WINDOW_DAYS });
  } catch (error) {
    logger.warn('purge_failed', { reason: (error as Error).message });
  }

  logger.info('finished', { checked: due.length, ok, failed, flagged });
}

/*
 * Close the pool, then exit. A scheduled job that leaves a connection open
 * never terminates, and a host that sees the previous run still going skips
 * the next one — so it runs once and then looks forgotten.
 */
/** The command-line entry point. */
async function main(): Promise<void> {
  await runLinkCheck({
    limit: Number.parseInt(argValue('limit') ?? '', 10) || undefined,
    all: process.argv.includes('--all'),
  });
}

/*
 * Run only when this file is the program.
 *
 * Imported by the maintenance job, it must define its work and do nothing;
 * run directly, it is the job.
 */
if (process.argv[1]?.includes('check-links')) {
  main()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('check_failed', { message: (error as Error)?.message });
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
}
