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

/**
 * A hint that this session has not verified its address yet.
 *
 * Only a hint. It exists so the proxy can send an unverified visitor to the
 * verification page without a database round trip on every request, and it is
 * deliberately not the thing that decides what anyone may do: voting,
 * contributing and the admin area each check the account itself on the
 * server. Forging this cookie buys nothing but the chance to look at pages
 * that are public anyway.
 */
export const UNVERIFIED_COOKIE = 'couchlist_unverified';
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(userId: string, verified = true): Promise<string> {
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

  if (verified) {
    store.delete(UNVERIFIED_COOKIE);
  } else {
    store.set(UNVERIFIED_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config().isProduction,
      path: '/',
      expires: expiresAt,
    });
  }

  return token;
}

/** Called once an address is confirmed, so the hold is lifted. */
export async function markSessionVerified(): Promise<void> {
  const store = await cookies();
  store.delete(UNVERIFIED_COOKIE);
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
  store.delete(UNVERIFIED_COOKIE);
}

/** Constant-time comparison for OAuth state, to avoid a timing oracle. */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
