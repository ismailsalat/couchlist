import { and, eq, sql } from 'drizzle-orm';
import {
  checkSourceHealth,
  countsAsFailure,
  createLogger,
  type HealthFetch,
} from '@couchlist/shared';
import { getDatabase } from '../client.js';
import { watchSources } from '../schema.js';
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

async function main(): Promise<void> {
  const db = getDatabase();
  const limit = Number.parseInt(argValue('limit') ?? '', 10) || DEFAULT_LIMIT;
  const all = process.argv.includes('--all');

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
        ? eq(watchSources.isEnabled, true)
        : and(
            eq(watchSources.isEnabled, true),
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

  logger.info('finished', { checked: due.length, ok, failed, flagged });
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.error('check_failed', { message: (error as Error)?.message });
    process.exit(1);
  });
