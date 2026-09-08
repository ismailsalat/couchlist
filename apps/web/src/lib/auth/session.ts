import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { sessions, users, type User } from '@couchlist/db';
import { config } from '../config';
import { repos } from '../db';

/**
 * Session handling.
 *
 * The cookie holds a random token; the database stores only its SHA-256 hash.
 * A dump of the sessions table therefore cannot be replayed as a login.
 */
export const SESSION_COOKIE = 'couchlist_session';
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(userId: string): Promise<string> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await repos().db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config().isProduction,
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/** The signed-in user, or null. Expired sessions are treated as absent. */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await repos()
    .db.select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0]?.user ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await repos().db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Constant-time comparison for OAuth state, to avoid a timing oracle. */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
