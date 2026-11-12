import 'server-only';
import { createLogger } from '@couchlist/shared';
import { repos } from '@/lib/db';

const log = createLogger({ service: 'maintenance' });

/**
 * Couchlist's scheduled work, run from inside the web server.
 *
 * The jobs themselves already existed and are one command away
 * (`npm run maintenance`). What was missing was anything to call them: the
 * host charges per service, so the weekly job was a second service that was
 * never created, and the result was a Live status tool that told every visitor
 * it had never checked a single site. A tool that reports nothing is worse
 * than no tool, so the schedule lives here instead, where deploying the site
 * is all it takes to start it.
 *
 * What makes this safe to put in a web process:
 *
 *   - Nothing is awaited at boot. `register()` returns immediately and the
 *     first pass waits for FIRST_PASS_DELAY_MS, so a healthcheck is never
 *     behind a network scan of 54 websites.
 *   - A PostgreSQL advisory lock guards each pass, so scaling the web service
 *     past one instance cannot have two of them checking the same sites or
 *     downloading the same 13 MB of blocklists at once.
 *   - Each job decides for itself whether it is due, from the database rather
 *     than from a timer. A restart therefore cannot re-run anything early,
 *     which matters on a host where a deploy restarts the process.
 *   - Every failure is caught and logged. Maintenance must never be able to
 *     take the website down with it.
 *
 * The honest cost: a schedule inside the web server stops when the web server
 * stops. For link checking that is the right trade — the one moment nobody is
 * reading the status page is while the site is down — but it is why
 * MAINTENANCE_IN_PROCESS exists, so this can be handed back to a real cron.
 */

/** Long enough for the server to answer its healthcheck and settle first. */
const FIRST_PASS_DELAY_MS = 60_000;

/**
 * How often to wake up and ask whether anything is due.
 *
 * Cheap on purpose: the link check only selects sources last checked over six
 * days ago, so most ticks find nothing to do and cost one indexed query.
 */
const TICK_MS = 6 * 60 * 60 * 1000;

/** Blocklists are rebuilt upstream daily; weekly keeps us close enough. */
const BLOCKLIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Advisory lock key. Arbitrary but fixed, and namespaced by the first number
 * so it cannot collide with a lock another part of the app takes later.
 */
const LOCK = { namespace: 4242, id: 1 } as const;

let started = false;

/**
 * Run `body` only if no other instance is running it.
 *
 * The lock is taken on ONE connection checked out of the pool for the whole
 * pass, not through the usual query helper, and that detail is the whole
 * correctness of this function.
 *
 * `pg_try_advisory_lock` is held by the *session*. Every ordinary query here
 * borrows whichever pooled connection is free and hands it straight back, so
 * a lock taken by one query and released by the next are frequently on two
 * different sessions: the unlock returns false, nothing says so, and the
 * original connection keeps the lock for as long as the pool keeps it alive.
 * Written that way this scheduler ran exactly one pass and then skipped every
 * later one in silence, which is worse than not having it, because the logs
 * say "skipped, locked" and look deliberate. Measured, not assumed — see
 * tests/integration/maintenance-lock.test.ts.
 *
 * So: one client, held for the pass, unlocked on itself. If the unlock fails
 * anyway, the connection is destroyed rather than returned, because ending
 * the session is the one thing guaranteed to drop the lock.
 *
 * `pg_try_advisory_lock` also returns immediately rather than queueing, which
 * is what we want: if another instance is mid-pass, this one has nothing to
 * add and should wait for the next tick.
 */
async function withLock(body: () => Promise<void>): Promise<void> {
  const pool = repos().db.$client;
  const client = await pool.connect();
  let held = false;

  try {
    const taken = await client.query<{ ok: boolean }>(
      'select pg_try_advisory_lock($1, $2) as ok',
      [LOCK.namespace, LOCK.id],
    );
    held = taken.rows[0]?.ok === true;

    if (!held) {
      log.info('pass_skipped_locked');
      return;
    }

    await body();
  } finally {
    if (held) {
      try {
        const freed = await client.query<{ ok: boolean }>(
          'select pg_advisory_unlock($1, $2) as ok',
          [LOCK.namespace, LOCK.id],
        );
        if (freed.rows[0]?.ok !== true) {
          // Should be unreachable on the same session. If it ever happens,
          // throwing the connection away is what stops the lock leaking.
          log.warn('unlock_refused_dropping_connection');
          client.release(true);
          return;
        }
      } catch (error) {
        log.warn('unlock_failed_dropping_connection', {
          message: (error as Error)?.message,
        });
        client.release(true);
        return;
      }
    }

    client.release();
  }
}

/** Whether the blocklists are old enough to be worth re-downloading. */
async function blocklistsAreStale(): Promise<boolean> {
  const syncs = await repos().tools.lastSyncs();
  if (syncs.length === 0) return true;

  const newest = syncs
    .map((sync) => sync.finishedAt?.getTime() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return Date.now() - newest > BLOCKLIST_MAX_AGE_MS;
}

/**
 * Run one job, recording that it was attempted either way.
 *
 * The record is the point. A job that throws every time and a job that has
 * never run both leave the data empty, and without an attempt written down
 * they produce the same page — so a schedule that quietly broke looks exactly
 * like one that was never set up. Writing the attempt first and the outcome
 * after also means a pass killed mid-flight by a redeploy leaves a row with
 * no finish time, which is its own useful signal.
 */
async function runJob(job: string, body: () => Promise<void>): Promise<void> {
  const tools = repos().tools;

  let id: string | undefined;
  try {
    id = await tools.startMaintenanceRun(job);
  } catch (error) {
    // Losing the bookkeeping is not a reason to skip the work.
    log.warn('run_record_failed', { job, message: (error as Error)?.message });
  }

  try {
    await body();
    if (id) await tools.finishMaintenanceRun(id, { ok: true });
  } catch (error) {
    const message = (error as Error)?.message ?? 'Unknown error.';
    log.warn('job_failed', { job, message });
    if (id) {
      await tools
        .finishMaintenanceRun(id, { ok: false, detail: message })
        .catch(() => undefined);
    }
  }
}

async function runPass(): Promise<void> {
  await withLock(async () => {
    // The link check goes first and each job is recorded separately, so a
    // failing blocklist download cannot stop the one whose absence every
    // visitor can see.
    await runJob('link-check', async () => {
      const { runLinkCheck } = await import('@couchlist/db');
      await runLinkCheck({});
    });

    if (await blocklistsAreStale().catch(() => false)) {
      await runJob('blocklists', async () => {
        const { runBlocklistSync } = await import('@couchlist/db');
        const domains = await runBlocklistSync();
        log.info('blocklists_refreshed', { domains });
      });
    }

    /*
     * Preview capture is deliberately not here. It drives a real browser,
     * which is hundreds of megabytes the web container has no other reason to
     * carry, and the screenshots only feed a queue a moderator looks at by
     * hand. It stays a command: `npm run capture:previews`.
     */
  });
}

/**
 * Start the schedule. Returns at once; nothing is awaited.
 *
 * Calling it twice is a no-op, because Next.js can call `register()` again
 * for a second runtime and two schedules would double every request we make
 * to somebody else's website.
 */
export function startMaintenanceSchedule(): void {
  if (started) return;
  started = true;

  const tick = (): void => {
    void runPass().catch((error: unknown) => {
      log.warn('pass_failed', { message: (error as Error)?.message });
    });
  };

  const first = setTimeout(tick, FIRST_PASS_DELAY_MS);
  const every = setInterval(tick, TICK_MS);

  // Unreferenced so these timers alone never hold the process open during a
  // redeploy. The HTTP server is what keeps it alive.
  first.unref?.();
  every.unref?.();

  log.info('maintenance_scheduled', {
    firstPassInSeconds: FIRST_PASS_DELAY_MS / 1000,
    everyHours: TICK_MS / 3_600_000,
  });
}
