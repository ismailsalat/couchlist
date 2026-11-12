import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabase, type Database } from '@couchlist/db';
import { runMigrations } from '../../packages/db/src/migrate';

/**
 * The advisory lock that guards a maintenance pass.
 *
 * Why this is worth a real-database test rather than a mock: the whole point
 * of the lock is what PostgreSQL does when two connections ask for it at
 * once, and a mock would only prove that my idea of `pg_try_advisory_lock`
 * matches itself. If this is wrong, two web instances both scan 54 other
 * people's websites on every tick, which is the one failure mode that is
 * rude to somebody other than us.
 *
 * It also pins the behaviour the scheduler relies on but does not state:
 * `pg_try_advisory_lock` returns false immediately instead of queueing, and
 * the lock is held by the *session*, so a second pool connection is genuinely
 * a second contender.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5432/couchlist_test';

/** The same key the scheduler uses. Kept in step with scheduler.ts. */
const LOCK = { namespace: 4242, id: 1 } as const;


/** A separate key, so these never contend with the scheduler's own lock. */
const PROBE = { namespace: 9911, id: 7 } as const;

async function heldCount(
  db: Database,
  key: { namespace: number; id: number },
): Promise<number> {
  const result = await db.execute(
    sql`select count(*)::int as c
          from pg_locks
         where locktype = 'advisory'
           and classid = ${key.namespace}
           and objid = ${key.id}`,
  );
  return (result.rows as Array<{ c: number }>)[0]?.c ?? 0;
}

let a: Database;
let b: Database;

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
  // Two single-connection pools, so each is reliably its own session. A
  // shared pool could hand both queries the same connection, where the lock
  // is re-entrant and the test would pass while proving nothing.
  a = createDatabase({ connectionString: DATABASE_URL, ssl: false, max: 1 });
  b = createDatabase({ connectionString: DATABASE_URL, ssl: false, max: 1 });
}, 60_000);

afterAll(async () => {
  await a.$client.end().catch(() => undefined);
  await b.$client.end().catch(() => undefined);
});

async function tryLock(db: Database): Promise<boolean> {
  const result = await db.execute(
    sql`select pg_try_advisory_lock(${LOCK.namespace}, ${LOCK.id}) as ok`,
  );
  return Boolean((result.rows as Array<{ ok: boolean }>)[0]?.ok);
}

async function unlock(db: Database): Promise<void> {
  await db.execute(sql`select pg_advisory_unlock(${LOCK.namespace}, ${LOCK.id})`);
}

describe('maintenance advisory lock', () => {
  it('lets one holder in and turns the other away without waiting', async () => {
    expect(await tryLock(a)).toBe(true);

    const started = Date.now();
    expect(await tryLock(b)).toBe(false);
    // The scheduler skips the tick rather than queueing behind it, so this
    // must not block for the length of a pass.
    expect(Date.now() - started).toBeLessThan(2_000);

    await unlock(a);
  });

  it('hands the lock over once the holder releases it', async () => {
    expect(await tryLock(a)).toBe(true);
    expect(await tryLock(b)).toBe(false);

    await unlock(a);

    expect(await tryLock(b)).toBe(true);
    await unlock(b);
  });

  it('is free again after a release, so a pass is never locked out forever', async () => {
    expect(await tryLock(a)).toBe(true);
    await unlock(a);
    expect(await tryLock(a)).toBe(true);
    await unlock(a);
  });
});

describe('holding the lock across a pass', () => {
  /*
   * The regression that nearly shipped.
   *
   * `pg_try_advisory_lock` is held by the session, and the ordinary query
   * helper borrows a pooled connection per statement and hands it straight
   * back. Lock and unlock therefore land on different sessions: the unlock
   * returns false and the lock stays held by whichever connection took it,
   * for as long as the pool keeps that connection. A scheduler written that
   * way runs one pass and then skips every later one while logging that it
   * skipped because something else held the lock — alive in the logs, doing
   * nothing. This test is here so nobody rewrites it back.
   */
  it('cannot be released through the pool, which is why one client is held', async () => {
    const pooled = createDatabase({ connectionString: DATABASE_URL, ssl: false, max: 10 });

    try {
      const taken = await pooled.execute(
        sql`select pg_try_advisory_lock(${PROBE.namespace}, ${PROBE.id}) as ok`,
      );
      expect((taken.rows as Array<{ ok: boolean }>)[0]?.ok).toBe(true);

      // Churn the pool, as a serving process would.
      await Promise.all(
        Array.from({ length: 9 }, () => pooled.execute(sql`select pg_sleep(0.05)`)),
      );

      const released = await pooled.execute(
        sql`select pg_advisory_unlock(${PROBE.namespace}, ${PROBE.id}) as ok`,
      );

      // False: this session never held it.
      expect((released.rows as Array<{ ok: boolean }>)[0]?.ok).toBe(false);
      expect(await heldCount(pooled, PROBE)).toBe(1);
    } finally {
      // Ending the pool is what actually drops it.
      await pooled.$client.end().catch(() => undefined);
    }
  });

  it('releases cleanly when lock and unlock share one checked-out client', async () => {
    const pooled = createDatabase({ connectionString: DATABASE_URL, ssl: false, max: 10 });

    try {
      const client = await pooled.$client.connect();
      try {
        const taken = await client.query<{ ok: boolean }>(
          'select pg_try_advisory_lock($1, $2) as ok',
          [PROBE.namespace, PROBE.id],
        );
        expect(taken.rows[0]?.ok).toBe(true);

        await Promise.all(
          Array.from({ length: 9 }, () => pooled.execute(sql`select pg_sleep(0.05)`)),
        );

        const released = await client.query<{ ok: boolean }>(
          'select pg_advisory_unlock($1, $2) as ok',
          [PROBE.namespace, PROBE.id],
        );
        expect(released.rows[0]?.ok).toBe(true);
      } finally {
        client.release();
      }

      // Nothing left holding it, so the next pass can run.
      expect(await heldCount(pooled, PROBE)).toBe(0);
    } finally {
      await pooled.$client.end().catch(() => undefined);
    }
  });
});
