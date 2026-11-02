import 'server-only';
import { AppError, ERROR_CODES } from '@couchlist/shared';
import type { User } from '@couchlist/db';
import { currentUser } from '../auth/session';

/**
 * Authorization guards.
 *
 * Every protected route calls one of these. A hidden button is never the
 * control: a hand-written request has to fail here, on the server.
 */

/** The signed-in user, or a 401. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user || user.deletedAt) throw AppError.unauthorized();
  return user;
}

/**
 * A verified account.
 *
 * Browsing, searching and reading are public. Contributing and voting need a
 * verified email, because that is the only thing standing between the
 * directory and an endless supply of throwaway accounts.
 */
export async function requireVerifiedUser(): Promise<User> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) {
    throw new AppError(ERROR_CODES.CL_FORBIDDEN, {
      userMessage: 'Verify your email address first.',
      context: { reason: 'email_not_verified' },
    });
  }
  return user;
}

/**
 * An administrator.
 *
 * The role is a column on the account, checked here on every request. It
 * replaces the previous Discord owner-id allowlist: authorization is a
 * property of the account, not of an environment variable that happens to
 * contain a snowflake.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new AppError(ERROR_CODES.CL_FORBIDDEN, {
      userMessage: 'That area is for administrators.',
      context: { reason: 'not_admin' },
    });
  }
  return user;
}

/** The signed-in user, or null. For pages that render either way. */
export async function optionalUser(): Promise<User | null> {
  const user = await currentUser();
  return user && !user.deletedAt ? user : null;
}
