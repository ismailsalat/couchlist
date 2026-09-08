import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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

  /**
   * Add or update one list entry.
   *
   * The unique index on (user, provider, media id, type) makes a duplicate
   * physically impossible, so this is an upsert rather than a read-then-write
   * that could race with a double-clicked button.
   */
  async upsert(input: UpsertEntryInput): Promise<MediaEntry> {
    const rows = await this.db
      .insert(mediaEntries)
      .values({
        userId: input.userId,
        provider: input.provider,
        providerMediaId: input.providerMediaId,
        mediaType: input.mediaType,
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
          updatedAt: new Date(),
        },
      })
      .returning();

    return rows[0]!;
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

  async remove(userId: string, identity: EntryIdentity): Promise<boolean> {
    const rows = await this.db
      .delete(mediaEntries)
      .where(this.identityFilter(userId, identity))
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
        count: sql<number>`count(*)::int`,
        avgRating: sql<number | null>`avg(${mediaEntries.rating})`,
        ratingCount: sql<number>`count(${mediaEntries.rating})::int`,
      })
      .from(mediaEntries)
      .where(
        and(
          inArray(mediaEntries.userId, userIds),
          eq(mediaEntries.provider, identity.provider),
          eq(mediaEntries.providerMediaId, identity.providerMediaId),
          eq(mediaEntries.mediaType, identity.mediaType),
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
          eq(mediaEntries.provider, identity.provider),
          eq(mediaEntries.providerMediaId, identity.providerMediaId),
          eq(mediaEntries.mediaType, identity.mediaType),
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

    const rows = await this.db
      .select({
        provider: mediaEntries.provider,
        providerMediaId: mediaEntries.providerMediaId,
        mediaType: mediaEntries.mediaType,
        title: sql<string>`max(${mediaEntries.title})`,
        posterUrl: sql<string | null>`max(${mediaEntries.posterUrl})`,
        memberCount: sql<number>`count(distinct ${mediaEntries.userId})::int`,
        averageRating: sql<number | null>`avg(${mediaEntries.rating})`,
      })
      .from(mediaEntries)
      .where(inArray(mediaEntries.userId, userIds))
      .groupBy(mediaEntries.provider, mediaEntries.providerMediaId, mediaEntries.mediaType)
      .orderBy(sql`count(distinct ${mediaEntries.userId}) desc`)
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      averageRating:
        row.averageRating === null ? null : Number(Number(row.averageRating).toFixed(2)),
    }));
  }
}
