import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  ALL_CATEGORIES,
  categoriesFromFlags,
  normalizeSearchText,
  SourceSort,
  type CategoryFilter,
  type SourceCategory,
} from '@couchlist/shared';
import type { Database } from '../client.js';
import {
  sourceBookmarks,
  sourceVotes,
  watchSourceReports,
  watchSources,
  type WatchSourceRow,
} from '../schema.js';

/**
 * The public source directory.
 *
 * Vote totals are aggregated in SQL rather than loaded per row, so a page of
 * the directory is one query regardless of how many votes exist.
 */

/** A directory row, already carrying its totals. Safe to send to a browser. */
export interface DirectorySource {
  id: string;
  name: string;
  domain: string;
  homepageUrl: string;
  description: string | null;
  iconUrl: string | null;
  categories: SourceCategory[];
  hasLotsOfAds: boolean;
  shouldAvoid: boolean;
  avoidReason: string | null;
  /** True when a contributor supplied a site icon. Not the bytes. */
  hasIcon: boolean;
  likes: number;
  dislikes: number;
  adminRankPenalty: number;
  createdAt: Date;
  /** Null unless a human actually checked the link. */
  linksReviewedAt: Date | null;
}

export interface DirectoryQuery {
  category?: CategoryFilter;
  search?: string;
  sort?: SourceSort;
  limit?: number;
  offset?: number;
  /** Admin listings may include hidden rows; the public directory never does. */
  includeHidden?: boolean;
  /** Restricts to the sources this user saved, for the Saved view. */
  savedByUserId?: string;
  ids?: string[];
}

export interface DirectoryPage {
  sources: DirectorySource[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Column backing each category filter. */
function categoryCondition(category: CategoryFilter): SQL | undefined {
  switch (category) {
    case 'Anime':
      return eq(watchSources.supportsAnime, true);
    case 'Movies':
      return eq(watchSources.supportsMovies, true);
    case 'TV':
      return eq(watchSources.supportsTv, true);
    case 'Manga':
      return eq(watchSources.supportsManga, true);
    case 'Manhwa':
      return eq(watchSources.supportsManhwa, true);
    case 'Comics':
      return eq(watchSources.supportsComics, true);
    default:
      return undefined;
  }
}

/**
 * Builds the search condition.
 *
 * Searches name, domain, description and category names. The query is
 * normalised first, so "manwha" matches Manhwa sources: the same
 * normalisation is applied to the stored category words below.
 */
function searchCondition(rawSearch: string): SQL | undefined {
  const normalized = normalizeSearchText(rawSearch);
  if (!normalized) return undefined;

  const terms = normalized.split(' ').filter(Boolean).slice(0, 6);
  if (terms.length === 0) return undefined;

  // Every term must match somewhere, which makes extra words narrow the list
  // instead of widening it.
  const perTerm = terms.map((term) => {
    const pattern = `%${term.replace(/[%_\\]/gu, (char) => `\\${char}`)}%`;
    return sql`(
      lower(${watchSources.name}) like ${pattern}
      or lower(${watchSources.domain}) like ${pattern}
      or lower(coalesce(${watchSources.description}, '')) like ${pattern}
      or (${watchSources.supportsAnime} and 'anime' like ${pattern})
      or (${watchSources.supportsMovies} and 'movies' like ${pattern})
      or (${watchSources.supportsTv} and 'tv' like ${pattern})
      or (${watchSources.supportsManga} and 'manga' like ${pattern})
      or (${watchSources.supportsManhwa} and 'manhwa' like ${pattern})
      or (${watchSources.supportsComics} and 'comics' like ${pattern})
    )`;
  });

  return sql.join(perTerm, sql` and `);
}

function toDirectorySource(row: WatchSourceRow & { likes: number; dislikes: number }): DirectorySource {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    homepageUrl: row.homepageUrl,
    description: row.description,
    iconUrl: row.iconUrl,
    categories: categoriesFromFlags(row),
    hasLotsOfAds: row.hasLotsOfAds,
    shouldAvoid: row.shouldAvoid,
    avoidReason: row.avoidReason,
    // Only the type is on the row, so this costs nothing.
    hasIcon: row.iconMime !== null,
    likes: row.likes,
    dislikes: row.dislikes,
    adminRankPenalty: row.adminRankPenalty,
    createdAt: row.createdAt,
    linksReviewedAt: row.linksReviewedAt,
  };
}

export class SourceDirectoryRepository {
  constructor(private readonly db: Database) {}

  /**
   * Like and dislike counts per source, as a joinable subquery.
   *
   * `filter (where ...)` keeps it to a single pass over source_votes.
   */
  private voteTotalsSubquery() {
    return this.db
      .select({
        sourceId: sourceVotes.sourceId,
        likes: sql<number>`count(*) filter (where ${sourceVotes.value} = 'LIKE')::int`.as(
          'likes',
        ),
        dislikes: sql<number>`count(*) filter (where ${sourceVotes.value} = 'DISLIKE')::int`.as(
          'dislikes',
        ),
      })
      .from(sourceVotes)
      .groupBy(sourceVotes.sourceId)
      .as('vote_totals');
  }

  /**
   * One page of the directory.
   *
   * Ranking happens in SQL so that pagination is correct: sorting a single page
   * in JavaScript would reorder rows within the page but not across pages, and
   * the left-hand number would stop meaning anything.
   */
  async list(query: DirectoryQuery = {}): Promise<DirectoryPage> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(query.offset ?? 0, 0);
    const sort = query.sort ?? SourceSort.RECOMMENDED;

    const conditions: SQL[] = [];
    if (!query.includeHidden) conditions.push(eq(watchSources.isEnabled, true));

    const category = query.category ?? ALL_CATEGORIES;
    const categoryWhere = categoryCondition(category);
    if (categoryWhere) conditions.push(categoryWhere);

    if (query.search) {
      const searchWhere = searchCondition(query.search);
      if (searchWhere) conditions.push(searchWhere);
    }

    if (query.ids) {
      if (query.ids.length === 0) {
        return { sources: [], total: 0, limit, offset };
      }
      conditions.push(inArray(watchSources.id, query.ids));
    }

    if (query.savedByUserId) {
      conditions.push(
        sql`exists (
          select 1 from ${sourceBookmarks}
          where ${sourceBookmarks.sourceId} = ${watchSources.id}
            and ${sourceBookmarks.userId} = ${query.savedByUserId}
        )`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    /*
     * Vote totals come from one grouped subquery joined on the source id.
     *
     * Not a correlated scalar subquery: Drizzle renders a column inside an
     * `sql` template unqualified, so `watch_sources.id` would arrive as a bare
     * "id" and bind to source_votes' own id column, silently matching nothing.
     * An aliased join keeps the correlation explicit and costs one pass over
     * the votes instead of two per row.
     */
    const voteTotals = this.voteTotalsSubquery();
    const likes = sql<number>`coalesce(${voteTotals.likes}, 0)`;
    const dislikes = sql<number>`coalesce(${voteTotals.dislikes}, 0)`;

    /*
     * The same confidence-aware shrinkage as `confidenceWeightedLikeRatio`
     * in @couchlist/shared, expressed in SQL so it can order and paginate.
     * Prior 0.5 with weight 8; the operator penalty is subtracted.
     * `shared/directory/ranking.ts` is the reference implementation and the
     * unit tests check the two agree.
     */
    const score = sql<number>`(
      ((${likes})::numeric + 0.5 * 8) / ((${likes})::numeric + (${dislikes})::numeric + 8)
      - (${watchSources.adminRankPenalty}::numeric / 100)
    )`;

    const orderBy =
      sort === SourceSort.NAME
        ? [asc(sql`lower(${watchSources.name})`)]
        : sort === SourceSort.NEWEST
          ? [desc(watchSources.createdAt), asc(sql`lower(${watchSources.name})`)]
          : [
              desc(score),
              desc(sql`(${likes}) + (${dislikes})`),
              asc(sql`lower(${watchSources.name})`),
            ];

    const [rows, totals] = await Promise.all([
      this.db
        .select({ source: watchSources, likes, dislikes })
        .from(watchSources)
        .leftJoin(voteTotals, eq(voteTotals.sourceId, watchSources.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(watchSources)
        .where(where),
    ]);

    return {
      sources: rows.map((row) =>
        toDirectorySource({ ...row.source, likes: row.likes, dislikes: row.dislikes }),
      ),
      total: totals[0]?.count ?? 0,
      limit,
      offset,
    };
  }

  /** One source with its totals, or undefined. */
  async findById(id: string, options: { includeHidden?: boolean } = {}): Promise<DirectorySource | undefined> {
    const page = await this.list({ ids: [id], limit: 1, includeHidden: options.includeHidden });
    return page.sources[0];
  }

  async findRowById(id: string): Promise<WatchSourceRow | undefined> {
    const rows = await this.db.select().from(watchSources).where(eq(watchSources.id, id)).limit(1);
    return rows[0];
  }

  async findByDomain(domain: string): Promise<WatchSourceRow | undefined> {
    const rows = await this.db
      .select()
      .from(watchSources)
      .where(eq(watchSources.domain, domain))
      .limit(1);
    return rows[0];
  }

  /**
   * Sources that share a category with this one.
   *
   * Similarity is "shares a content category", which is a real attribute of
   * the row. There is no model here and nothing is described as personalised.
   */
  async similar(sourceId: string, limit = 5): Promise<DirectorySource[]> {
    const source = await this.findRowById(sourceId);
    if (!source) return [];

    const shared: SQL[] = [];
    if (source.supportsAnime) shared.push(eq(watchSources.supportsAnime, true));
    if (source.supportsMovies) shared.push(eq(watchSources.supportsMovies, true));
    if (source.supportsTv) shared.push(eq(watchSources.supportsTv, true));
    if (source.supportsManga) shared.push(eq(watchSources.supportsManga, true));
    if (source.supportsManhwa) shared.push(eq(watchSources.supportsManhwa, true));
    if (source.supportsComics) shared.push(eq(watchSources.supportsComics, true));
    if (shared.length === 0) return [];

    const voteTotals = this.voteTotalsSubquery();
    const likes = sql<number>`coalesce(${voteTotals.likes}, 0)`;
    const dislikes = sql<number>`coalesce(${voteTotals.dislikes}, 0)`;

    const rows = await this.db
      .select({ source: watchSources, likes, dislikes })
      .from(watchSources)
      .leftJoin(voteTotals, eq(voteTotals.sourceId, watchSources.id))
      .where(
        and(
          eq(watchSources.isEnabled, true),
          sql`${watchSources.id} <> ${sourceId}`,
          or(...shared)!,
        ),
      )
      .orderBy(desc(likes))
      .limit(Math.min(Math.max(limit, 1), 12));

    return rows.map((row) =>
      toDirectorySource({ ...row.source, likes: row.likes, dislikes: row.dislikes }),
    );
  }

  /** Recently added or recently corrected sources, for the What's new feed. */
  async recentlyAdded(limit = 10): Promise<DirectorySource[]> {
    const page = await this.list({ sort: SourceSort.NEWEST, limit });
    return page.sources;
  }

  /* ------------------------------- votes -------------------------------- */

  /**
   * Casts, changes or clears one account's vote.
   *
   * The upsert plus the unique index is what makes "one vote per account per
   * source" true under concurrency: two simultaneous requests cannot both
   * insert, and the loser updates instead of erroring.
   */
  async setVote(
    sourceId: string,
    userId: string,
    value: 'LIKE' | 'DISLIKE' | 'NONE',
  ): Promise<{ likes: number; dislikes: number; userVote: 'LIKE' | 'DISLIKE' | null }> {
    if (value === 'NONE') {
      await this.db
        .delete(sourceVotes)
        .where(and(eq(sourceVotes.sourceId, sourceId), eq(sourceVotes.userId, userId)));
    } else {
      await this.db
        .insert(sourceVotes)
        .values({ sourceId, userId, value })
        .onConflictDoUpdate({
          target: [sourceVotes.sourceId, sourceVotes.userId],
          set: { value, updatedAt: new Date() },
        });
    }

    return this.voteState(sourceId, userId);
  }

  async voteState(
    sourceId: string,
    userId?: string,
  ): Promise<{ likes: number; dislikes: number; userVote: 'LIKE' | 'DISLIKE' | null }> {
    const rows = await this.db
      .select({ value: sourceVotes.value, userId: sourceVotes.userId })
      .from(sourceVotes)
      .where(eq(sourceVotes.sourceId, sourceId));

    return {
      likes: rows.filter((row) => row.value === 'LIKE').length,
      dislikes: rows.filter((row) => row.value === 'DISLIKE').length,
      userVote: userId
        ? (rows.find((row) => row.userId === userId)?.value ?? null)
        : null,
    };
  }

  /** This user's votes across a set of sources, for rendering a list. */
  async votesByUser(userId: string, sourceIds: string[]): Promise<Map<string, 'LIKE' | 'DISLIKE'>> {
    if (sourceIds.length === 0) return new Map();
    const rows = await this.db
      .select({ sourceId: sourceVotes.sourceId, value: sourceVotes.value })
      .from(sourceVotes)
      .where(and(eq(sourceVotes.userId, userId), inArray(sourceVotes.sourceId, sourceIds)));
    return new Map(rows.map((row) => [row.sourceId, row.value]));
  }

  /* ----------------------------- bookmarks ------------------------------ */

  async setBookmark(
    sourceId: string,
    userId: string,
    saved: boolean,
    note?: string | null,
  ): Promise<boolean> {
    if (!saved) {
      await this.db
        .delete(sourceBookmarks)
        .where(and(eq(sourceBookmarks.sourceId, sourceId), eq(sourceBookmarks.userId, userId)));
      return false;
    }

    await this.db
      .insert(sourceBookmarks)
      .values({ sourceId, userId, note: note ?? null })
      .onConflictDoUpdate({
        target: [sourceBookmarks.sourceId, sourceBookmarks.userId],
        set: note === undefined ? { updatedAt: new Date() } : { note: note ?? null, updatedAt: new Date() },
      });
    return true;
  }

  /** The owner's private note. Only ever called with the owner's own id. */
  async bookmarkNote(sourceId: string, userId: string): Promise<string | null> {
    const rows = await this.db
      .select({ note: sourceBookmarks.note })
      .from(sourceBookmarks)
      .where(and(eq(sourceBookmarks.sourceId, sourceId), eq(sourceBookmarks.userId, userId)))
      .limit(1);
    return rows[0]?.note ?? null;
  }

  async bookmarkedIds(userId: string, sourceIds?: string[]): Promise<Set<string>> {
    const conditions: SQL[] = [eq(sourceBookmarks.userId, userId)];
    if (sourceIds) {
      if (sourceIds.length === 0) return new Set();
      conditions.push(inArray(sourceBookmarks.sourceId, sourceIds));
    }
    const rows = await this.db
      .select({ sourceId: sourceBookmarks.sourceId })
      .from(sourceBookmarks)
      .where(and(...conditions));
    return new Set(rows.map((row) => row.sourceId));
  }

  async bookmarkCount(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sourceBookmarks)
      .where(eq(sourceBookmarks.userId, userId));
    return rows[0]?.count ?? 0;
  }

  /** Saved sources with their private notes, for the owner's export. */
  async savedWithNotes(
    userId: string,
  ): Promise<Array<{ source: DirectorySource; note: string | null; savedAt: Date }>> {
    const rows = await this.db
      .select({ sourceId: sourceBookmarks.sourceId, note: sourceBookmarks.note, savedAt: sourceBookmarks.createdAt })
      .from(sourceBookmarks)
      .where(eq(sourceBookmarks.userId, userId))
      .orderBy(desc(sourceBookmarks.createdAt));

    if (rows.length === 0) return [];
    const page = await this.list({ ids: rows.map((row) => row.sourceId), limit: MAX_LIMIT, includeHidden: true });
    const byId = new Map(page.sources.map((source) => [source.id, source]));

    return rows
      .map((row) => {
        const source = byId.get(row.sourceId);
        return source ? { source, note: row.note, savedAt: row.savedAt } : null;
      })
      .filter((entry): entry is { source: DirectorySource; note: string | null; savedAt: Date } => entry !== null);
  }

  /* ------------------------------- admin -------------------------------- */

  /** Open report counts per source, so the admin list shows real workload. */
  async openReportCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ sourceId: watchSourceReports.watchSourceId, count: sql<number>`count(*)::int` })
      .from(watchSourceReports)
      .where(and(isNull(watchSourceReports.resolvedAt), sql`${watchSourceReports.watchSourceId} is not null`))
      .groupBy(watchSourceReports.watchSourceId);

    return new Map(
      rows
        .filter((row): row is { sourceId: string; count: number } => row.sourceId !== null)
        .map((row) => [row.sourceId, row.count]),
    );
  }
}
