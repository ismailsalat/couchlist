import { describe, expect, it } from 'vitest';
import {
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_TTL_MINUTES,
  cooldownRemaining,
  decoyPasswordHash,
  expiresInMinutes,
  generateResetToken,
  generateVerificationCode,
  hashAuthToken,
  hashPassword,
  isExpired,
  verifyPassword,
} from '@couchlist/shared';
import {
  changePasswordSchema,
  deleteAccountSchema,
  displayNameSchema,
  passwordSchema,
  signupSchema,
  verificationCodeSchema,
} from '@couchlist/shared';

describe('password hashing', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false);
  });

  it('never stores the password itself', async () => {
    const password = 'a-very-memorable-passphrase';
    const stored = await hashPassword(password);
    expect(stored).not.toContain(password);
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-twice'), hashPassword('same-password-twice')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password-twice', a)).toBe(true);
    expect(await verifyPassword('same-password-twice', b)).toBe(true);
  });

  it('returns false rather than throwing on a missing or corrupt hash', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$2$3')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('normalises unicode, so the same typed password works across keyboards', async () => {
    // U+00E9 versus e + U+0301: the same character, two encodings.
    const stored = await hashPassword('café-password-1234');
    expect(await verifyPassword('café-password-1234', stored)).toBe(true);
  });

  it('offers a decoy hash so an unknown email costs the same work', async () => {
    const decoy = await decoyPasswordHash();
    expect(decoy.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('anything', decoy)).toBe(false);
    // Cached, so login latency stays constant rather than paying per request.
    expect(await decoyPasswordHash()).toBe(decoy);
  });
});

describe('verification codes and reset tokens', () => {
  it('generates six digits, keeping any leading zeros', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/u);
      expect(code).toHaveLength(6);
    }
  });

  it('generates reset tokens long enough not to be guessed', () => {
    const token = generateResetToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(generateResetToken()).not.toBe(token);
  });

  it('hashes tokens before storage, ignoring surrounding whitespace', () => {
    expect(hashAuthToken('123456')).toBe(hashAuthToken(' 123456 '));
    expect(hashAuthToken('123456')).not.toBe('123456');
    expect(hashAuthToken('123456')).not.toBe(hashAuthToken('123457'));
  });

  it('expires a code at its deadline, not after it', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const expires = expiresInMinutes(VERIFICATION_TTL_MINUTES, now);

    expect(isExpired(expires, now)).toBe(false);
    expect(isExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
    // Exactly at the deadline counts as expired.
    expect(isExpired(expires, expires)).toBe(true);
    expect(isExpired(expires, new Date(expires.getTime() + 1))).toBe(true);
  });

  it('reports a resend cooldown that counts down', () => {
    const now = new Date('2026-01-01T00:01:00Z');
    expect(cooldownRemaining(now, now)).toBe(RESEND_COOLDOWN_SECONDS);
    expect(cooldownRemaining(new Date(now.getTime() - 30_000), now)).toBe(30);
    expect(cooldownRemaining(new Date(now.getTime() - 60_000), now)).toBe(0);
    expect(cooldownRemaining(new Date(now.getTime() - 600_000), now)).toBe(0);
    expect(cooldownRemaining(null, now)).toBe(0);
  });

  it('bounds guessing against a short code', () => {
    expect(MAX_VERIFICATION_ATTEMPTS).toBeLessThanOrEqual(10);
    expect(MAX_VERIFICATION_ATTEMPTS).toBeGreaterThan(1);
  });
});

describe('account validation', () => {
  it('requires a usable password length', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(500)).success).toBe(false);
  });

  it('lowercases and trims an email so one address cannot register twice', () => {
    const parsed = signupSchema.parse({
      email: '  Person@Example.COM ',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-password',
      displayName: 'Person',
    });
    expect(parsed.email).toBe('person@example.com');
  });

  it('refuses a signup where the two passwords do not match', () => {
    const mismatched = signupSchema.safeParse({
      email: 'person@example.com',
      password: 'a-long-enough-password',
      confirmPassword: 'a-long-enough-passwodr',
      displayName: 'Person',
    });
    expect(mismatched.success).toBe(false);
    if (!mismatched.success) {
      expect(mismatched.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });

  it('refuses a signup with no confirmation at all', () => {
    expect(
      signupSchema.safeParse({
        email: 'person@example.com',
        password: 'a-long-enough-password',
        displayName: 'Person',
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(
      signupSchema.safeParse({
        email: 'nope',
        password: 'a'.repeat(12),
        confirmPassword: 'a'.repeat(12),
        displayName: 'A B',
      }).success,
    ).toBe(false);
  });

  it('rejects display names with control or layout characters', () => {
    expect(displayNameSchema.safeParse('Mina').success).toBe(true);
    expect(displayNameSchema.safeParse('M').success).toBe(false);
    expect(displayNameSchema.safeParse('Mina‮evil').success).toBe(false);
    expect(displayNameSchema.safeParse('Mina\u0000').success).toBe(false);
  });

  it('accepts only a six-digit verification code', () => {
    expect(verificationCodeSchema.safeParse('012345').success).toBe(true);
    expect(verificationCodeSchema.safeParse('12345').success).toBe(false);
    expect(verificationCodeSchema.safeParse('1234567').success).toBe(false);
    expect(verificationCodeSchema.safeParse('abcdef').success).toBe(false);
  });

  it('requires the exact confirmation word before deleting an account', () => {
    expect(deleteAccountSchema.safeParse({ password: 'x', confirm: 'DELETE' }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: 'x', confirm: 'delete' }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: 'x', confirm: 'yes' }).success).toBe(false);
  });

  it('requires the current password to set a new one', () => {
    expect(changePasswordSchema.safeParse({ newPassword: 'a'.repeat(12) }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old',
        newPassword: 'a'.repeat(12),
        confirmPassword: 'a'.repeat(12),
      }).success,
    ).toBe(true);
  });

  it('refuses a password change whose confirmation does not match', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old',
        newPassword: 'a'.repeat(12),
        confirmPassword: 'b'.repeat(12),
      }).success,
    ).toBe(false);
  });
});
