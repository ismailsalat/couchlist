import 'server-only';
import {
  AppError,
  CreditMode,
  ERROR_CODES,
  MAX_VERIFICATION_ATTEMPTS,
  PASSWORD_RESET_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_TTL_MINUTES,
  cooldownRemaining,
  createLogger,
  decoyPasswordHash,
  expiresInMinutes,
  generateResetToken,
  generateVerificationCode,
  hashAuthToken,
  hashPassword,
  verifyPassword,
  type LoginInput,
  type SignupInput,
} from '@couchlist/shared';
import type { User } from '@couchlist/db';
import { config } from '../config';
import { repos } from '../db';
import { createSession, destroySession } from './session';
import { passwordResetEmail, sendMail, verificationEmail } from '../mail/transport';

/**
 * Email account authentication.
 *
 * Shape of the guarantees here:
 *  - Signup and "forgot password" never reveal whether an address is
 *    registered. Both always report the same thing.
 *  - A verification code is single use, expires, and is attempt-limited.
 *  - A session is only created after a password check succeeds. Nothing tells
 *    the browser it is signed in before that.
 */

const logger = createLogger({ service: 'web' });

export interface AuthOutcome {
  /** Whether the message actually left the building. Reported honestly. */
  emailDelivered: boolean;
  /** Dev only: the code, so a local signup can be completed without a mailbox. */
  devCode?: string;
}

/* -------------------------------- signup -------------------------------- */

export async function signUp(input: SignupInput): Promise<AuthOutcome> {
  const { accounts } = repos();
  const existing = await accounts.findByEmail(input.email);

  if (existing) {
    /*
     * The address is taken. Returning "already registered" here would turn
     * signup into an account-existence oracle, so the response is identical to
     * a successful signup and the real owner gets an email instead.
     */
    logger.info('signup_duplicate_email');
    if (!existing.emailVerifiedAt) {
      return issueVerification(existing, input.email);
    }
    const notice = await sendMail({
      to: input.email,
      subject: 'Someone tried to sign up with your email',
      text: [
        'Someone tried to create a Couchlist account with this email address.',
        '',
        'You already have one, so nothing has changed. If it was you, sign in instead,',
        'or use the "Forgot password" link if you need a new password.',
      ].join('\n'),
    });
    /*
     * Report what actually happened. Hard-coding `true` here claimed a
     * delivery that may never have left, which is the one thing this flow
     * must not do: somebody waiting for an email that failed is worse off
     * than somebody told it failed. It still says nothing about whether the
     * address was already registered, which is what the response has to keep
     * quiet about.
     */
    return { emailDelivered: notice.delivered };
  }

  const passwordHash = await hashPassword(input.password);
  const created = await accounts.create({
    email: input.email,
    passwordHash,
    displayName: input.displayName,
  });

  // Null means the unique index rejected a concurrent signup for this address.
  if (!created) {
    logger.info('signup_race_lost');
    /*
     * The other request won by milliseconds and is sending its own code. Send
     * one for the row that exists rather than claiming a delivery this
     * request never made; if the row has somehow gone, say so honestly.
     */
    const winner = await accounts.findByEmail(input.email);
    if (winner && !winner.emailVerifiedAt) return issueVerification(winner, input.email);
    return { emailDelivered: false };
  }

  await grantBootstrapAdmin(created);
  return issueVerification(created, input.email);
}

/**
 * Issues and sends a verification code.
 *
 * Any previous unused code for the account is superseded, so only the newest
 * email works.
 */
async function issueVerification(user: User, email: string): Promise<AuthOutcome> {
  const { accounts } = repos();
  const code = generateVerificationCode();

  await accounts.issueToken({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
    tokenHash: hashAuthToken(code),
    sentToEmail: email,
    expiresAt: expiresInMinutes(VERIFICATION_TTL_MINUTES),
  });

  const template = verificationEmail(code, VERIFICATION_TTL_MINUTES);
  const result = await sendMail({ to: email, ...template });

  return {
    emailDelivered: result.delivered,
    // Only ever outside production, and only for the log transport.
    devCode: !config().isProduction && result.transport === 'log' ? code : undefined,
  };
}

export async function resendVerification(user: User): Promise<AuthOutcome> {
  const { accounts } = repos();
  if (user.emailVerifiedAt) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'That email is already verified.',
    });
  }
  if (!user.email) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'This account has no email address.',
    });
  }

  const lastSent = await accounts.lastIssuedAt(user.id, 'EMAIL_VERIFICATION');
  const wait = cooldownRemaining(lastSent);
  if (wait > 0) {
    throw new AppError(ERROR_CODES.CL_RATE_LIMITED, {
      userMessage: `Please wait ${wait} more second${wait === 1 ? '' : 's'} before asking for another code.`,
      context: { cooldownSeconds: RESEND_COOLDOWN_SECONDS },
    });
  }

  return issueVerification(user, user.email);
}

/**
 * Verifies an email address with a typed code.
 *
 * A wrong guess costs the live code one of its attempts, so guessing is bounded
 * even though the code is only six digits.
 */
export async function verifyEmail(user: User, code: string): Promise<void> {
  const { accounts } = repos();

  if (user.emailVerifiedAt) return;
  if (!user.email) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'This account has no email address.',
    });
  }

  const result = await accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
    expectedEmail: user.email,
    maxAttempts: MAX_VERIFICATION_ATTEMPTS,
  });

  if (!result.ok) {
    await accounts.recordFailedAttempt(user.id, 'EMAIL_VERIFICATION');
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: verificationFailureMessage(result.reason),
      context: { reason: result.reason },
    });
  }

  // A code is issued for one account; make sure it is this one.
  if (result.token.userId !== user.id) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage: 'That code is not valid for this account.',
    });
  }

  await accounts.markEmailVerified(user.id);
  logger.info('email_verified');
}

function verificationFailureMessage(reason: string): string {
  switch (reason) {
    case 'expired':
      return 'That code has expired. Ask for a new one.';
    case 'already_used':
      return 'That code has already been used. Ask for a new one.';
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Ask for a new code.';
    case 'email_changed':
      return 'That code was sent to a different address. Ask for a new one.';
    default:
      return 'That code is not correct.';
  }
}

/* --------------------------------- login -------------------------------- */

/**
 * Signs in.
 *
 * A missing account still pays for a password hash, so the response time does
 * not reveal which addresses are registered, and both failures return the same
 * message.
 */
export async function signIn(input: LoginInput): Promise<User> {
  const { accounts } = repos();
  const user = await accounts.findByEmail(input.email);

  const storedHash = user?.passwordHash ?? (await decoyPasswordHash());
  const passwordOk = await verifyPassword(input.password, storedHash);

  if (!user || !user.passwordHash || !passwordOk || user.deletedAt) {
    throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
      userMessage: 'That email and password do not match.',
    });
  }

  await grantBootstrapAdmin(user);
  await createSession(user.id);
  logger.info('login_succeeded');
  return user;
}

export async function signOut(): Promise<void> {
  await destroySession();
}

/* ---------------------------- password reset ---------------------------- */

/**
 * Starts a password reset.
 *
 * Returns the same outcome whether or not the address exists, so this endpoint
 * cannot be used to discover registered addresses.
 */
export async function requestPasswordReset(email: string): Promise<AuthOutcome> {
  const { accounts } = repos();
  const user = await accounts.findByEmail(email);

  if (!user || !user.email) {
    logger.info('password_reset_unknown_email');
    return { emailDelivered: true };
  }

  const lastSent = await accounts.lastIssuedAt(user.id, 'PASSWORD_RESET');
  if (cooldownRemaining(lastSent) > 0) {
    // Silently succeed: telling the caller about a cooldown would confirm the
    // address exists.
    return { emailDelivered: true };
  }

  const token = generateResetToken();
  await accounts.issueToken({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    tokenHash: hashAuthToken(token),
    sentToEmail: user.email,
    expiresAt: expiresInMinutes(PASSWORD_RESET_TTL_MINUTES),
  });

  const url = `${config().APP_BASE_URL.replace(/\/+$/u, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const template = passwordResetEmail(url, PASSWORD_RESET_TTL_MINUTES);
  const result = await sendMail({ to: user.email, ...template });

  return {
    emailDelivered: result.delivered,
    devCode: !config().isProduction && result.transport === 'log' ? token : undefined,
  };
}

/**
 * Completes a password reset.
 *
 * Consuming the token and changing the password happen together, and every
 * other session is dropped so a reset actually locks out whoever prompted it.
 */
export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  const { accounts, db } = repos();
  const result = await accounts.consumeToken('PASSWORD_RESET', hashAuthToken(token), {
    maxAttempts: 10,
  });

  if (!result.ok) {
    throw new AppError(ERROR_CODES.CL_VALIDATION_FAILED, {
      userMessage:
        result.reason === 'expired'
          ? 'That reset link has expired. Ask for a new one.'
          : 'That reset link is no longer valid. Ask for a new one.',
      context: { reason: result.reason },
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await accounts.updatePasswordHash(result.token.userId, passwordHash);
  await dropAllSessions(db, result.token.userId);

  // A verified reset link also proves the address works.
  const user = await accounts.findById(result.token.userId);
  if (user && !user.emailVerifiedAt) {
    await accounts.markEmailVerified(user.id);
  }

  logger.info('password_reset_completed');
}

export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { accounts, db } = repos();
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
      userMessage: 'That is not your current password.',
    });
  }

  await accounts.updatePasswordHash(user.id, await hashPassword(newPassword));
  await dropAllSessions(db, user.id);
  // The caller is still the owner, so give them a fresh session.
  await createSession(user.id);
}

export async function deleteOwnAccount(user: User, password: string): Promise<void> {
  const { accounts } = repos();
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
      userMessage: 'That password is not correct.',
    });
  }

  await accounts.softDelete(user.id);
  await destroySession();
  logger.info('account_deleted');
}

/* ------------------------------ admin role ------------------------------ */

/**
 * Promotes an account listed in ADMIN_EMAILS.
 *
 * This is bootstrapping only: it writes the role onto the account row, and
 * every authorization check reads that column server-side. The env var is how
 * the first administrator comes to exist, not how permission is decided.
 */
async function grantBootstrapAdmin(user: User): Promise<void> {
  if (user.isAdmin || !user.email) return;
  const admins = config().ADMIN_EMAILS;
  if (!admins.includes(user.email.toLowerCase())) return;

  await repos().accounts.setAdmin(user.id, true);
  user.isAdmin = true;
  logger.warn('admin_role_granted_from_env', { reason: 'ADMIN_EMAILS' });
}

async function dropAllSessions(db: ReturnType<typeof repos>['db'], userId: string): Promise<void> {
  const { sessions } = await import('@couchlist/db');
  const { eq } = await import('drizzle-orm');
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export const DEFAULT_CREDIT_MODE = CreditMode.CREDITED;
