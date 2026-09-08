import { and, eq, lt } from 'drizzle-orm';
import type { Database } from '../client.js';
import { mediaCache } from '../schema.js';
import type { EntryIdentity } from './entries.js';

/**
 * Metadata cache.
 *
 * Couchlist does not mirror AniList or TMDB - it keeps the small amount it
 * renders, with an expiry, so one user refreshing a page repeatedly cannot
 * hammer an upstream provider.
 */
export class MediaCacheRepository {
  constructor(private readonly db: Database) {}

  private filter(identity: EntryIdentity) {
    return and(
      eq(mediaCache.provider, identity.provider),
      eq(mediaCache.providerMediaId, identity.providerMediaId),
      eq(mediaCache.mediaType, identity.mediaType),
    );
  }

  /** Returns the payload only while it is still fresh. */
  async get<T>(identity: EntryIdentity): Promise<T | undefined> {
    const rows = await this.db.select().from(mediaCache).where(this.filter(identity)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    if (row.expiresAt.getTime() <= Date.now()) return undefined;
    return row.payload as T;
  }

  async set(
    identity: EntryIdentity,
    value: { title: string; year: number | null; posterUrl: string | null; bannerUrl: string | null },
    payload: unknown,
    ttlHours: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.db
      .insert(mediaCache)
      .values({
        provider: identity.provider,
        providerMediaId: identity.providerMediaId,
        mediaType: identity.mediaType,
        title: value.title,
        year: value.year,
        posterUrl: value.posterUrl,
        bannerUrl: value.bannerUrl,
        payload: payload as object,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [mediaCache.provider, mediaCache.providerMediaId, mediaCache.mediaType],
        set: {
          title: value.title,
          year: value.year,
          posterUrl: value.posterUrl,
          bannerUrl: value.bannerUrl,
          payload: payload as object,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }

  async purgeExpired(): Promise<number> {
    const rows = await this.db
      .delete(mediaCache)
      .where(lt(mediaCache.expiresAt, new Date()))
      .returning({ id: mediaCache.id });
    return rows.length;
  }
}
