import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { animeAliases } from '../schema.js';
import type { EntryIdentity } from './entries.js';

export interface AnimeAliasIdentity {
  provider: 'ANILIST' | 'JIKAN' | 'KITSU';
  providerMediaId: string;
}

/** Small persistent cross-provider Anime identity cache. */
export class AnimeAliasRepository {
  constructor(private readonly db: Database) {}

  async find(identity: EntryIdentity): Promise<string | undefined> {
    if (identity.mediaType !== 'ANIME' || identity.provider === 'TMDB') return undefined;
    const rows = await this.db
      .select({ canonicalMediaKey: animeAliases.canonicalMediaKey })
      .from(animeAliases)
      .where(
        and(
          eq(animeAliases.provider, identity.provider),
          eq(animeAliases.providerMediaId, identity.providerMediaId),
        ),
      )
      .limit(1);
    return rows[0]?.canonicalMediaKey;
  }

  async upsert(identity: EntryIdentity, canonicalMediaKey: string): Promise<void> {
    if (identity.mediaType !== 'ANIME' || identity.provider === 'TMDB') return;
    await this.db
      .insert(animeAliases)
      .values({
        provider: identity.provider,
        providerMediaId: identity.providerMediaId,
        canonicalMediaKey,
      })
      .onConflictDoUpdate({
        target: [animeAliases.provider, animeAliases.providerMediaId],
        set: { canonicalMediaKey, updatedAt: new Date() },
      });
  }

  async aliasesFor(canonicalMediaKey: string): Promise<AnimeAliasIdentity[]> {
    const rows = await this.db
      .select({
        provider: animeAliases.provider,
        providerMediaId: animeAliases.providerMediaId,
      })
      .from(animeAliases)
      .where(eq(animeAliases.canonicalMediaKey, canonicalMediaKey));

    return rows.flatMap((row) =>
      row.provider === 'TMDB'
        ? []
        : [{ provider: row.provider, providerMediaId: row.providerMediaId }],
    );
  }
}
