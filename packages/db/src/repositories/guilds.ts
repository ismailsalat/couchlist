import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  discordGuilds,
  guildMemberships,
  guildSettings,
  users,
  type DiscordGuildRow,
  type User,
} from '../schema.js';

export interface DiscordGuildInput {
  discordId: string;
  name: string;
  iconUrl?: string | null;
}

export class GuildRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<DiscordGuildRow | undefined> {
    const rows = await this.db.select().from(discordGuilds).where(eq(discordGuilds.id, id)).limit(1);
    return rows[0];
  }

  async findByDiscordId(discordId: string): Promise<DiscordGuildRow | undefined> {
    const rows = await this.db
      .select()
      .from(discordGuilds)
      .where(eq(discordGuilds.discordId, discordId))
      .limit(1);
    return rows[0];
  }

  async upsert(input: DiscordGuildInput): Promise<DiscordGuildRow> {
    const rows = await this.db
      .insert(discordGuilds)
      .values({
        discordId: input.discordId,
        name: input.name,
        iconUrl: input.iconUrl ?? null,
      })
      .onConflictDoUpdate({
        target: discordGuilds.discordId,
        set: { name: input.name, iconUrl: input.iconUrl ?? null, updatedAt: new Date() },
      })
      .returning();
    return rows[0]!;
  }

  /** Called when the bot joins or is removed. Never touches user lists. */
  async setBotConnected(discordId: string, connected: boolean): Promise<void> {
    await this.db
      .update(discordGuilds)
      .set({
        botConnected: connected,
        connectedAt: connected ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(discordGuilds.discordId, discordId));
  }

  async getSettings(guildId: string) {
    const rows = await this.db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);
    return rows[0];
  }

  async ensureSettings(guildId: string) {
    const existing = await this.getSettings(guildId);
    if (existing) return existing;

    const rows = await this.db
      .insert(guildSettings)
      .values({ guildId })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? (await this.getSettings(guildId))!;
  }

  /**
   * Replace a user's membership set with what Discord just told us.
   *
   * Guilds the user has left are marked inactive rather than deleted: we stop
   * granting access immediately but keep the history.
   */
  async syncMemberships(
    userId: string,
    guildDiscordIds: string[],
  ): Promise<{ active: number; deactivated: number }> {
    return this.db.transaction(async (tx) => {
      const known =
        guildDiscordIds.length > 0
          ? await tx
              .select({ id: discordGuilds.id })
              .from(discordGuilds)
              .where(inArray(discordGuilds.discordId, guildDiscordIds))
          : [];

      const knownIds = known.map((row) => row.id);
      const now = new Date();

      for (const guildId of knownIds) {
        await tx
          .insert(guildMemberships)
          .values({ userId, guildId, isActive: true, lastVerifiedAt: now })
          .onConflictDoUpdate({
            target: [guildMemberships.userId, guildMemberships.guildId],
            set: { isActive: true, lastVerifiedAt: now },
          });
      }

      const deactivated = await tx
        .update(guildMemberships)
        .set({ isActive: false, lastVerifiedAt: now })
        .where(
          and(
            eq(guildMemberships.userId, userId),
            knownIds.length > 0
              ? sql`${guildMemberships.guildId} NOT IN ${knownIds}`
              : sql`true`,
            eq(guildMemberships.isActive, true),
          ),
        )
        .returning({ id: guildMemberships.id });

      return { active: knownIds.length, deactivated: deactivated.length };
    });
  }

  /** Active guilds for a user. This is the basis of every access check. */
  async activeGuildsForUser(userId: string): Promise<DiscordGuildRow[]> {
    const rows = await this.db
      .select({ guild: discordGuilds })
      .from(guildMemberships)
      .innerJoin(discordGuilds, eq(guildMemberships.guildId, discordGuilds.id))
      .where(
        and(
          eq(guildMemberships.userId, userId),
          eq(guildMemberships.isActive, true),
          eq(discordGuilds.botConnected, true),
        ),
      );
    return rows.map((row) => row.guild);
  }

  /** True only if the user is currently an active member. */
  async isMember(userId: string, guildId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: guildMemberships.id })
      .from(guildMemberships)
      .where(
        and(
          eq(guildMemberships.userId, userId),
          eq(guildMemberships.guildId, guildId),
          eq(guildMemberships.isActive, true),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Set one user's membership for one guild without touching their memberships
   * in other servers. Used by the bot to repair a pre-existing Couchlist
   * account when a server is connected after that person already signed in.
   */
  async setMembership(userId: string, guildId: string, active: boolean): Promise<void> {
    const now = new Date();
    await this.db
      .insert(guildMemberships)
      .values({ userId, guildId, isActive: active, lastVerifiedAt: now })
      .onConflictDoUpdate({
        target: [guildMemberships.userId, guildMemberships.guildId],
        set: { isActive: active, lastVerifiedAt: now },
      });
  }

  async membersOf(guildId: string): Promise<User[]> {
    const rows = await this.db
      .select({ user: users })
      .from(guildMemberships)
      .innerJoin(users, eq(guildMemberships.userId, users.id))
      .where(and(eq(guildMemberships.guildId, guildId), eq(guildMemberships.isActive, true)));
    return rows.map((row) => row.user);
  }

  /** Guild ids two users both belong to - used to authorise comparisons. */
  async sharedGuildIds(userA: string, userB: string): Promise<string[]> {
    if (userA === userB) {
      const own = await this.db
        .select({ guildId: guildMemberships.guildId })
        .from(guildMemberships)
        .innerJoin(discordGuilds, eq(guildMemberships.guildId, discordGuilds.id))
        .where(
          and(
            eq(guildMemberships.userId, userA),
            eq(guildMemberships.isActive, true),
            eq(discordGuilds.botConnected, true),
          ),
        );
      return own.map((row) => row.guildId);
    }

    // A guild appearing for both users appears exactly twice.
    const rows = await this.db
      .select({ guildId: guildMemberships.guildId })
      .from(guildMemberships)
      .innerJoin(discordGuilds, eq(guildMemberships.guildId, discordGuilds.id))
      .where(
        and(
          inArray(guildMemberships.userId, [userA, userB]),
          eq(guildMemberships.isActive, true),
          eq(discordGuilds.botConnected, true),
        ),
      )
      .groupBy(guildMemberships.guildId)
      .having(sql`count(distinct ${guildMemberships.userId}) = 2`);

    return rows.map((row) => row.guildId);
  }
}
