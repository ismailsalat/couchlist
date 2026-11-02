import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Verification codes and reset tokens.
 *
 * Only hashes are stored. A verification code is short because a human types
 * it from an email, so it is protected by expiry and an attempt limit rather
 * than by length. A reset token travels in a link, so it is long instead.
 */

export const VERIFICATION_CODE_LENGTH = 6;
/** Long enough to be useful, short enough that a stolen email ages out. */
export const VERIFICATION_TTL_MINUTES = 30;
export const PASSWORD_RESET_TTL_MINUTES = 60;
/** Resend cooldown, so the endpoint is not an email cannon. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Guesses allowed against one code before it is dead. */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/** A uniformly random 6-digit code, leading zeros included. */
export function generateVerificationCode(): string {
  return String(randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)).padStart(
    VERIFICATION_CODE_LENGTH,
    '0',
  );
}

export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The stored form of a code or token.
 *
 * SHA-256 without a salt is deliberate: these are high-entropy, single-use and
 * short-lived, so a slow hash would only add login latency. Password hashing
 * uses scrypt; this is not a password.
 */
export function hashAuthToken(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex');
}

export function expiresInMinutes(minutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Seconds a caller must wait before another send, or 0 when they may send. */
export function cooldownRemaining(
  lastSentAt: Date | null | undefined,
  now: Date = new Date(),
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (!lastSentAt) return 0;
  const elapsed = (now.getTime() - lastSentAt.getTime()) / 1000;
  return elapsed >= cooldownSeconds ? 0 : Math.ceil(cooldownSeconds - elapsed);
}
