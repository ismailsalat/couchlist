import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { isUniqueViolation } from './errors.js';
import { authTokens, sessions, users, type AuthTokenRow, type User } from '../schema.js';

/**
 * Email accounts, verification codes and reset tokens.
 *
 * Kept separate from UserRepository, which still serves the legacy Discord
 * profile path. Nothing here reads or writes a discord_id, so an old account
 * is never silently adopted by an email signup.
 */

export interface CreateAccountInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

export type AuthTokenPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface IssueTokenInput {
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  sentToEmail: string;
  expiresAt: Date;
}

export type ConsumeResult =
  | { ok: true; token: AuthTokenRow }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' | 'too_many_attempts' | 'email_changed' };

export class AccountRepository {
  constructor(private readonly db: Database) {}

  /** Lookup is always on the lowercased address, matching the unique index. */
  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`, isNull(users.deletedAt)))
      .limit(1);
    return rows[0];
  }

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  /**
   * Creates an unverified account.
   *
   * Relies on the unique email index rather than a read-then-write check, so
   * two simultaneous signups for one address cannot both succeed.
   */
  async create(input: CreateAccountInput): Promise<User | null> {
    const email = input.email.trim().toLowerCase();
    try {
      const rows = await this.db
        .insert(users)
        .values({
          email,
          passwordHash: input.passwordHash,
          displayName: input.displayName.trim(),
          // The legacy column is NOT NULL; the display name is the honest value.
          username: input.displayName.trim(),
        })
        .returning();
      return rows[0] ?? null;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string; avatarUrl?: string | null; bio?: string | null },
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
    if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
    // An empty bio is a cleared bio, not an empty string in the database.
    if (patch.bio !== undefined) set.bio = patch.bio?.trim() ? patch.bio.trim() : null;
    await this.db.update(users).set(set).where(eq(users.id, userId));
  }

  /**
   * Soft-deletes an account.
   *
   * The row survives so that contribution credit and moderation history do not
   * develop holes, but every piece of personal identity is cleared and the
   * account can no longer be signed into. `publicCredit` renders a deleted
   * account as Anonymous, so the old display name does not leak either.
   */
  async softDelete(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(authTokens).where(eq(authTokens.userId, userId));
      await tx
        .update(users)
        .set({
          deletedAt: new Date(),
          email: null,
          passwordHash: null,
          displayName: null,
          avatarUrl: null,
          username: 'deleted-account',
          globalName: null,
          discordId: null,
          emailVerifiedAt: null,
          isAdmin: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  }

  async setAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await this.db.update(users).set({ isAdmin, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async adminCount(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.isAdmin, true), isNull(users.deletedAt)));
    return rows[0]?.count ?? 0;
  }

  /* ----------------------------- tokens -------------------------------- */

  /**
   * Issues a code or token, replacing any unused one of the same purpose.
   *
   * Superseding the previous code means a resend invalidates the old email, so
   * only the newest message works.
   */
  async issueToken(input: IssueTokenInput): Promise<AuthTokenRow> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.userId, input.userId),
            eq(authTokens.purpose, input.purpose),
            isNull(authTokens.consumedAt),
          ),
        );

      const rows = await tx
        .insert(authTokens)
        .values({
          userId: input.userId,
          purpose: input.purpose,
          tokenHash: input.tokenHash,
          sentToEmail: input.sentToEmail.trim().toLowerCase(),
          expiresAt: input.expiresAt,
        })
        .returning();

      const row = rows[0];
      if (!row) throw new Error('Could not issue an auth token.');
      return row;
    });
  }

  /** The most recent issue time, for the resend cooldown. */
  async lastIssuedAt(userId: string, purpose: AuthTokenPurpose): Promise<Date | null> {
    const rows = await this.db
      .select({ createdAt: authTokens.createdAt })
      .from(authTokens)
      .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)))
      .orderBy(desc(authTokens.createdAt))
      .limit(1);
    return rows[0]?.createdAt ?? null;
  }

  /**
   * Spends a code or token exactly once.
   *
   * The consuming UPDATE is conditional on the row still being unused, so two
   * concurrent requests cannot both succeed: the second updates zero rows and
   * is reported as already used.
   */
  async consumeToken(
    purpose: AuthTokenPurpose,
    tokenHash: string,
    options: { expectedEmail?: string; maxAttempts: number } = { maxAttempts: 5 },
  ): Promise<ConsumeResult> {
    const rows = await this.db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.purpose, purpose), eq(authTokens.tokenHash, tokenHash)))
      .limit(1);

    const token = rows[0];
    if (!token) return { ok: false, reason: 'not_found' };
    if (token.consumedAt) return { ok: false, reason: 'already_used' };
    if (token.attemptCount >= options.maxAttempts) {
      return { ok: false, reason: 'too_many_attempts' };
    }
    if (token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

    if (
      options.expectedEmail !== undefined &&
      token.sentToEmail !== options.expectedEmail.trim().toLowerCase()
    ) {
      return { ok: false, reason: 'email_changed' };
    }

    const consumed = await this.db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt)))
      .returning();

    if (consumed.length === 0) return { ok: false, reason: 'already_used' };
    return { ok: true, token: consumed[0]! };
  }

  /**
   * Records a failed guess against the live code for a user.
   *
   * Counting attempts on the row rather than on the submitted value means a
   * wrong guess costs the real code an attempt, so guessing is bounded.
   */
  async recordFailedAttempt(userId: string, purpose: AuthTokenPurpose): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ attemptCount: sql`${authTokens.attemptCount} + 1` })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      );
  }

  async liveToken(userId: string, purpose: AuthTokenPurpose): Promise<AuthTokenRow | undefined> {
    const rows = await this.db
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authTokens.createdAt))
      .limit(1);
    return rows[0];
  }

  /** Housekeeping: drop spent and expired rows. */
  async purgeStaleTokens(before: Date = new Date()): Promise<void> {
    await this.db.delete(authTokens).where(sql`${authTokens.expiresAt} < ${before}`);
  }
}

