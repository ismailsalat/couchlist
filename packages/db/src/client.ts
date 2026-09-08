import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema.js';

/**
 * Database connection.
 *
 * One pool per process, created lazily. `closeDatabase` exists so services can
 * shut down without leaving connections open, which matters on Railway where
 * redeploys are frequent.
 */
export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let database: Database | undefined;

export interface DatabaseOptions {
  connectionString: string;
  max?: number;
  /** Managed Postgres (Railway, Neon, Supabase) generally requires TLS. */
  ssl?: boolean;
}

export function createDatabase(options: DatabaseOptions): Database {
  const newPool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ...(options.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // A pool-level error must not take the process down.
  newPool.on('error', (error) => {
    process.stderr.write(`postgres pool error: ${error.message}\n`);
  });

  return drizzle(newPool, { schema });
}

/** Shared instance, built from DATABASE_URL on first use. */
export function getDatabase(connectionString?: string): Database {
  if (database) return database;

  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  pool = new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ...(requiresSsl(url) ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  pool.on('error', (error) => {
    process.stderr.write(`postgres pool error: ${error.message}\n`);
  });

  database = drizzle(pool, { schema });
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    database = undefined;
  }
}

/** Cheap liveness probe for /api/health and /admin status. */
export async function checkDatabaseHealth(db: Database): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

function requiresSsl(url: string): boolean {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=require/i.test(url)) return true;
  // Local development does not need TLS; hosted databases do.
  return !/localhost|127\.0\.0\.1/.test(url);
}

export { schema };
export * from './schema.js';
