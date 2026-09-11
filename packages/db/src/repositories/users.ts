import { and, eq, ilike, inArray, lt, ne, or } from 'drizzle-orm';
import type { Database } from '../client.js';
import { friendships, guildMemberships, mediaEntries, sessions, users, type User } from '../schema.js';

export interface DiscordProfile {
  discordId: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
}

export interface PrivacyUpdate {
  profileVisibility?: 'MUTUAL_SERVERS' | 'PRIVATE';
  showRatings?: boolean;
  showProgress?: boolean;
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async findByDiscordId(discordId: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.discordId, discordId)).limit(1);
    return rows[0];
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  /** Small people search for adding Couchlist friends. */
  async searchByName(query: string, excludeUserId: string, limit = 12): Promise<User[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return [];
    const pattern = `%${normalized}%`;
    return this.db
      .select()
      .from(users)
      .where(
        and(
          ne(users.id, excludeUserId),
          or(ilike(users.username, pattern), ilike(users.globalName, pattern)),
        ),
      )
      .limit(Math.min(Math.max(limit, 1), 20));
  }

  /**
   * Create or refresh a user from their Discord profile.
   *
   * Uses an upsert so two concurrent logins cannot create duplicate rows - the
   * unique index on discord_id is the real guarantee.
   */
  async upsertFromDiscord(profile: DiscordProfile): Promise<User> {
    const now = new Date();
    const rows = await this.db
      .insert(users)
      .values({
        discordId: profile.discordId,
        username: profile.username,
        globalName: profile.globalName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.discordId,
        set: {
          username: profile.username,
          globalName: profile.globalName ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning();

    return rows[0]!;
  }

  async updatePrivacy(userId: string, update: PrivacyUpdate): Promise<User | undefined> {
    const rows = await this.db
      .update(users)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0];
  }

  async touchLastSeen(userId: string): Promise<void> {
    await this.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
  }

  /** Records a completed Discord guild refresh, including an empty guild set. */
  async markGuildsSynced(userId: string, at = new Date()): Promise<void> {
    await this.db
      .update(users)
      .set({ guildsSyncedAt: at, updatedAt: at })
      .where(eq(users.id, userId));
  }

  /**
   * Everything Couchlist holds about one person, for the data export.
   * Deliberately excludes session tokens.
   */
  async exportData(userId: string): Promise<{
    profile: User | undefined;
    entries: unknown[];
    memberships: unknown[];
    friendships: unknown[];
  }> {
    const [profile] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const entries = await this.db
      .select()
      .from(mediaEntries)
      .where(eq(mediaEntries.userId, userId));
    const memberships = await this.db
      .select()
      .from(guildMemberships)
      .where(and(eq(guildMemberships.userId, userId), eq(guildMemberships.isActive, true)));
    const friendRows = await this.db
      .select()
      .from(friendships)
      .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));

    return { profile, entries, memberships, friendships: friendRows };
  }

  /**
   * Revoke every session for a user.
   *
   * Called on disconnect and before deletion, so a cookie issued earlier stops
   * working immediately rather than until it expires.
   */
  async revokeSessions(userId: string): Promise<number> {
    const rows = await this.db
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning({ id: sessions.id });
    return rows.length;
  }

  /**
   * Disconnect Couchlist: forget which servers they are in and end every
   * session, while leaving their own lists intact.
   */
  async disconnect(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx
        .update(guildMemberships)
        .set({ isActive: false })
        .where(eq(guildMemberships.userId, userId));
    });
  }

  /** Housekeeping: drop sessions that have already expired. */
  async purgeExpiredSessions(): Promise<number> {
    const rows = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning({ id: sessions.id });
    return rows.length;
  }

  /**
   * Full account deletion.
   *
   * Cascades remove sessions, entries and memberships. Audit rows survive with
   * a null actor, so the moderation trail stays intact without naming anyone.
   */
  async deleteAccount(userId: string): Promise<boolean> {
    const rows = await this.db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    return rows.length > 0;
  }
}
