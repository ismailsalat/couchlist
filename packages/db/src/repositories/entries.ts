import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { mediaEntries, users, type MediaEntry } from '../schema.js';

export type Provider = 'ANILIST' | 'JIKAN' | 'KITSU' | 'TMDB';
export type MediaKind = 'ANIME' | 'MOVIE' | 'TV';
export type EntryStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH';

export interface EntryIdentity {
  provider: Provider;
  providerMediaId: string;
  mediaType: MediaKind;
}

export interface UpsertEntryInput extends EntryIdentity {
  userId: string;
  canonicalMediaKey?: string | null;
  status: EntryStatus;
  rating?: number | null;
  progress?: number | null;
  title: string;
  posterUrl?: string | null;
}

export interface UpdateEntryInput {
  status?: EntryStatus;
  rating?: number | null;
  progress?: number | null;
}

export class EntryRepository {
  constructor(private readonly db: Database) {}

  private identityFilter(userId: string, identity: EntryIdentity) {
    return and(
      eq(mediaEntries.userId, userId),
      eq(mediaEntries.provider, identity.provider),
      eq(mediaEntries.providerMediaId, identity.providerMediaId),
      eq(mediaEntries.mediaType, identity.mediaType),
    );
  }

  async find(userId: string, identity: EntryIdentity): Promise<MediaEntry | undefined> {
    const rows = await this.db
      .select()
      .from(mediaEntries)
      .where(this.identityFilter(userId, identity))
      .limit(1);
    return rows[0];
  }

  async findById(id: string): Promise<MediaEntry | undefined> {
    const rows = await this.db.select().from(mediaEntries).where(eq(mediaEntries.id, id)).limit(1);
    return rows[0];
  }

  async findByCanonical(userId: string, canonicalMediaKey: string): Promise<MediaEntry | undefined> {
    const rows = await this.db
      .select()
      .from(mediaEntries)
      .where(
        and(
          eq(mediaEntries.userId, userId),
          eq(mediaEntries.canonicalMediaKey, canonicalMediaKey),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findIdentityOrCanonical(
    userId: string,
    identity: EntryIdentity,
    canonicalMediaKey?: string | null,
  ): Promise<MediaEntry | undefined> {
    if (canonicalMediaKey) {
      const canonical = await this.findByCanonical(userId, canonicalMediaKey);
      if (canonical) return canonical;
    }
    return this.find(userId, identity);
  }

  /**
   * Add or update one list entry.
   *
   * The unique index on (user, provider, media id, type) makes a duplicate
   * physically impossible, so this is an upsert rather than a read-then-write
   * that could race with a double-clicked button.
   */
  async upsert(input: UpsertEntryInput): Promise<MediaEntry> {
    if (input.canonicalMediaKey) {
      const canonical = await this.findByCanonical(input.userId, input.canonicalMediaKey);
      const exact = await this.find(input.userId, input);

      // The same Anime may already have been saved through another provider.
      // Update that one row instead of creating a second copy.
      if (canonical && canonical.id !== exact?.id) {
        const rows = await this.db
          .update(mediaEntries)
          .set({
            status: input.status,
            rating: input.rating ?? null,
            progress: input.progress ?? null,
            title: input.title,
            posterUrl: input.posterUrl ?? canonical.posterUrl,
            canonicalMediaKey: input.canonicalMediaKey,
            updatedAt: new Date(),
          })
          .where(eq(mediaEntries.id, canonical.id))
          .returning();

        if (exact && exact.id !== canonical.id) {
          await this.db.delete(mediaEntries).where(eq(mediaEntries.id, exact.id));
        }
        return rows[0]!;
      }
    }

    const rows = await this.db
      .insert(mediaEntries)
      .values({
        userId: input.userId,
        provider: input.provider,
        providerMediaId: input.providerMediaId,
        mediaType: input.mediaType,
        canonicalMediaKey: input.canonicalMediaKey ?? null,
        status: input.status,
        rating: input.rating ?? null,
        progress: input.progress ?? null,
        title: input.title,
        posterUrl: input.posterUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [
          mediaEntries.userId,
          mediaEntries.provider,
          mediaEntries.providerMediaId,
          mediaEntries.mediaType,
        ],
        set: {
          status: input.status,
          rating: input.rating ?? null,
          progress: input.progress ?? null,
          title: input.title,
          posterUrl: input.posterUrl ?? null,
          canonicalMediaKey: input.canonicalMediaKey ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return rows[0]!;
  }

  /**
   * Attach a canonical key to an old Anime row. If another row for the same
   * user already has that key, merge them instead of violating the canonical
   * unique index. This is the lazy migration path used by profiles/servers.
   */
  async reconcileCanonicalKey(entryId: string, canonicalMediaKey: string): Promise<MediaEntry | undefined> {
    const current = await this.findById(entryId);
    if (!current) return undefined;
    if (current.canonicalMediaKey === canonicalMediaKey) return current;

    const collision = await this.findByCanonical(current.userId, canonicalMediaKey);
    if (!collision || collision.id === current.id) {
      const rows = await this.db
        .update(mediaEntries)
        .set({ canonicalMediaKey, updatedAt: new Date() })
        .where(eq(mediaEntries.id, current.id))
        .returning();
      return rows[0];
    }

    const newer = current.updatedAt >= collision.updatedAt ? current : collision;
    const older = newer.id === current.id ? collision : current;
    const progressValues = [current.progress, collision.progress].filter(
      (value): value is number => value !== null,
    );
    const mergedProgress = progressValues.length > 0 ? Math.max(...progressValues) : null;
    const mergedRating = newer.rating ?? older.rating;
    const survivor = collision;

    const rows = await this.db
      .update(mediaEntries)
      .set({
        canonicalMediaKey,
        status: newer.status,
        rating: mergedRating,
        progress: mergedProgress,
        title: newer.title || older.title,
        posterUrl: newer.posterUrl ?? older.posterUrl,
        createdAt: current.createdAt <= collision.createdAt ? current.createdAt : collision.createdAt,
        updatedAt: current.updatedAt >= collision.updatedAt ? current.updatedAt : collision.updatedAt,
      })
      .where(eq(mediaEntries.id, survivor.id))
      .returning();

    if (current.id !== survivor.id) {
      await this.db.delete(mediaEntries).where(eq(mediaEntries.id, current.id));
    }
    return rows[0];
  }

  /** Partial update. Only the caller's own row can be reached. */
  async update(
    userId: string,
    identity: EntryIdentity,
    update: UpdateEntryInput,
  ): Promise<MediaEntry | undefined> {
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (update.status !== undefined) changes.status = update.status;
    if (update.rating !== undefined) changes.rating = update.rating;
    if (update.progress !== undefined) changes.progress = update.progress;

    const rows = await this.db
      .update(mediaEntries)
      .set(changes)
      .where(this.identityFilter(userId, identity))
      .returning();
    return rows[0];
  }

  async updateIdentityOrCanonical(
    userId: string,
    identity: EntryIdentity,
    canonicalMediaKey: string | null | undefined,
    update: UpdateEntryInput,
  ): Promise<MediaEntry | undefined> {
    const row = await this.findIdentityOrCanonical(userId, identity, canonicalMediaKey);
    if (!row) return undefined;
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (update.status !== undefined) changes.status = update.status;
    if (update.rating !== undefined) changes.rating = update.rating;
    if (update.progress !== undefined) changes.progress = update.progress;
    const rows = await this.db
      .update(mediaEntries)
      .set(changes)
      .where(eq(mediaEntries.id, row.id))
      .returning();
    return rows[0];
  }

  async remove(userId: string, identity: EntryIdentity): Promise<boolean> {
    const rows = await this.db
      .delete(mediaEntries)
      .where(this.identityFilter(userId, identity))
      .returning({ id: mediaEntries.id });
    return rows.length > 0;
  }

  async removeIdentityOrCanonical(
    userId: string,
    identity: EntryIdentity,
    canonicalMediaKey?: string | null,
  ): Promise<boolean> {
    const row = await this.findIdentityOrCanonical(userId, identity, canonicalMediaKey);
    if (!row) return false;
    const rows = await this.db
      .delete(mediaEntries)
      .where(and(eq(mediaEntries.id, row.id), eq(mediaEntries.userId, userId)))
      .returning({ id: mediaEntries.id });
    return rows.length > 0;
  }

  async listForUser(userId: string, status?: EntryStatus): Promise<MediaEntry[]> {
    return this.db
      .select()
      .from(mediaEntries)
      .where(
        status
          ? and(eq(mediaEntries.userId, userId), eq(mediaEntries.status, status))
          : eq(mediaEntries.userId, userId),
      )
      .orderBy(desc(mediaEntries.updatedAt));
  }

  async listForUsers(userIds: string[]): Promise<MediaEntry[]> {
    if (userIds.length === 0) return [];
    return this.db.select().from(mediaEntries).where(inArray(mediaEntries.userId, userIds));
  }

  async unresolvedAnimeForUsers(userIds: string[], limit = 12): Promise<MediaEntry[]> {
    if (userIds.length === 0 || limit <= 0) return [];
    return this.db
      .select()
      .from(mediaEntries)
      .where(
        and(
          inArray(mediaEntries.userId, userIds),
          eq(mediaEntries.mediaType, 'ANIME'),
          sql`${mediaEntries.canonicalMediaKey} is null`,
        ),
      )
      .orderBy(desc(mediaEntries.updatedAt))
      .limit(Math.min(Math.max(1, limit), 50));
  }

  async countsByStatus(userId: string): Promise<Record<EntryStatus, number>> {
    const rows = await this.db
      .select({ status: mediaEntries.status, count: sql<number>`count(*)::int` })
      .from(mediaEntries)
      .where(eq(mediaEntries.userId, userId))
      .groupBy(mediaEntries.status);

    const counts: Record<EntryStatus, number> = { WATCHING: 0, COMPLETED: 0, PLAN_TO_WATCH: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }

  /**
   * Recent activity from a set of users - the "Friends Watching" feed.
   * Callers pass only users the viewer is allowed to see.
   */
  async recentActivity(
    userIds: string[],
    limit = 10,
  ): Promise<Array<MediaEntry & { username: string; globalName: string | null; avatarUrl: string | null }>> {
    if (userIds.length === 0) return [];

    const rows = await this.db
      .select({
        entry: mediaEntries,
        username: users.username,
        globalName: users.globalName,
        avatarUrl: users.avatarUrl,
      })
      .from(mediaEntries)
      .innerJoin(users, eq(mediaEntries.userId, users.id))
      .where(and(inArray(mediaEntries.userId, userIds), eq(mediaEntries.status, 'WATCHING')))
      .orderBy(desc(mediaEntries.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      ...row.entry,
      username: row.username,
      globalName: row.globalName,
      avatarUrl: row.avatarUrl,
    }));
  }

  /**
   * Aggregate stats for one title across a set of users.
   * Used by the title page and the bot's /watch command.
   */
  async statsForMedia(
    userIds: string[],
    identity: EntryIdentity,
    canonicalMediaKey?: string | null,
  ): Promise<{
    completed: number;
    watching: number;
    planToWatch: number;
    averageRating: number | null;
    ratingCount: number;
  }> {
    const empty: {
      completed: number;
      watching: number;
      planToWatch: number;
      averageRating: number | null;
      ratingCount: number;
    } = { completed: 0, watching: 0, planToWatch: 0, averageRating: null, ratingCount: 0 };
    if (userIds.length === 0) return empty;

    const rows = await this.db
      .select({
        status: mediaEntries.status,
        count: sql<number>`count(distinct ${mediaEntries.userId})::int`,
        avgRating: sql<number | null>`avg(${mediaEntries.rating})`,
        ratingCount: sql<number>`count(distinct case when ${mediaEntries.rating} is not null then ${mediaEntries.userId} end)::int`,
      })
      .from(mediaEntries)
      .where(
        and(
          inArray(mediaEntries.userId, userIds),
          canonicalMediaKey
            ? or(
                eq(mediaEntries.canonicalMediaKey, canonicalMediaKey),
                and(
                  eq(mediaEntries.provider, identity.provider),
                  eq(mediaEntries.providerMediaId, identity.providerMediaId),
                  eq(mediaEntries.mediaType, identity.mediaType),
                ),
              )
            : and(
                eq(mediaEntries.provider, identity.provider),
                eq(mediaEntries.providerMediaId, identity.providerMediaId),
                eq(mediaEntries.mediaType, identity.mediaType),
              ),
        ),
      )
      .groupBy(mediaEntries.status);

    let ratingTotal = 0;
    let ratingCount = 0;
    const result = { ...empty };

    for (const row of rows) {
      if (row.status === 'COMPLETED') result.completed = row.count;
      if (row.status === 'WATCHING') result.watching = row.count;
      if (row.status === 'PLAN_TO_WATCH') result.planToWatch = row.count;
      if (row.avgRating !== null && row.ratingCount > 0) {
        ratingTotal += Number(row.avgRating) * row.ratingCount;
        ratingCount += row.ratingCount;
      }
    }

    result.ratingCount = ratingCount;
    result.averageRating = ratingCount > 0 ? Number((ratingTotal / ratingCount).toFixed(2)) : null;
    return result;
  }

  /** Ratings for one title from a set of users, highest first. */
  async ratingsForMedia(
    userIds: string[],
    identity: EntryIdentity,
    canonicalMediaKey?: string | null,
  ): Promise<Array<{ userId: string; username: string; globalName: string | null; rating: number }>> {
    if (userIds.length === 0) return [];

    const rows = await this.db
      .select({
        userId: mediaEntries.userId,
        username: users.username,
        globalName: users.globalName,
        rating: mediaEntries.rating,
      })
      .from(mediaEntries)
      .innerJoin(users, eq(mediaEntries.userId, users.id))
      .where(
        and(
          inArray(mediaEntries.userId, userIds),
          canonicalMediaKey
            ? or(
                eq(mediaEntries.canonicalMediaKey, canonicalMediaKey),
                and(
                  eq(mediaEntries.provider, identity.provider),
                  eq(mediaEntries.providerMediaId, identity.providerMediaId),
                  eq(mediaEntries.mediaType, identity.mediaType),
                ),
              )
            : and(
                eq(mediaEntries.provider, identity.provider),
                eq(mediaEntries.providerMediaId, identity.providerMediaId),
                eq(mediaEntries.mediaType, identity.mediaType),
              ),
          sql`${mediaEntries.rating} is not null`,
        ),
      )
      .orderBy(desc(mediaEntries.rating));

    return rows
      .filter((row): row is typeof row & { rating: number } => row.rating !== null)
      .map((row) => ({
        userId: row.userId,
        username: row.username,
        globalName: row.globalName,
        rating: row.rating,
      }));
  }

  /** Most-tracked titles across a guild's members. */
  async popularAmong(
    userIds: string[],
    limit = 5,
  ): Promise<
    Array<{
      provider: Provider;
      providerMediaId: string;
      mediaType: MediaKind;
      title: string;
      posterUrl: string | null;
      memberCount: number;
      averageRating: number | null;
    }>
  > {
    if (userIds.length === 0) return [];

    const rows = await this.listForUsers(userIds);
    const grouped = new Map<
      string,
      {
        provider: Provider;
        providerMediaId: string;
        mediaType: MediaKind;
        title: string;
        posterUrl: string | null;
        users: Set<string>;
        ratings: Map<string, number>;
      }
    >();

    for (const row of rows) {
      const key = row.canonicalMediaKey
        ? `canonical:${row.canonicalMediaKey}`
        : `${row.provider}:${row.mediaType}:${row.providerMediaId}`;
      const existing = grouped.get(key) ?? {
        provider: row.provider,
        providerMediaId: row.providerMediaId,
        mediaType: row.mediaType,
        title: row.title,
        posterUrl: row.posterUrl,
        users: new Set<string>(),
        ratings: new Map<string, number>(),
      };
      existing.users.add(row.userId);
      if (row.rating !== null) existing.ratings.set(row.userId, row.rating);
      if (!existing.posterUrl && row.posterUrl) existing.posterUrl = row.posterUrl;
      grouped.set(key, existing);
    }

    return [...grouped.values()]
      .map((row) => ({
        provider: row.provider,
        providerMediaId: row.providerMediaId,
        mediaType: row.mediaType,
        title: row.title,
        posterUrl: row.posterUrl,
        memberCount: row.users.size,
        averageRating:
          row.ratings.size === 0
            ? null
            : Number(
                (
                  [...row.ratings.values()].reduce((sum, value) => sum + value, 0) /
                  row.ratings.size
                ).toFixed(2),
              ),
      }))
      .sort((a, b) => b.memberCount - a.memberCount || a.title.localeCompare(b.title))
      .slice(0, limit);
  }
}
