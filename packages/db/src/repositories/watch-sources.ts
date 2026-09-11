import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import {
  canonicalizeExternalUrl,
  normalizeDomain,
  type WatchAccessType,
  type WatchAvailabilityStatus,
  type WatchReportReason,
  type WatchSourceOrigin,
  watchHealthStatus,
  weightedWatchRating,
  type WatchSourceType,
} from '@couchlist/shared';
import type { Database } from '../client.js';
import {
  mediaWatchSources,
  serverWatchPosts,
  users,
  watchSourceCandidates,
  watchSourceHealthVotes,
  watchSourceRatings,
  watchSourceReports,
  watchSources,
  type MediaWatchSourceRow,
  type NewWatchSource,
  type WatchSourceRow,
} from '../schema.js';

/** One availability row joined to the source that owns it. */
export interface WatchListing {
  listing: MediaWatchSourceRow;
  source: WatchSourceRow;
}

export interface WatchSourceStats {
  ratingAverage: number | null;
  ratingCount: number;
  likes: number;
  dislikes: number;
  likePercent: number | null;
  sentimentScore: number;
  workingRecent: number;
  brokenRecent: number;
  reliabilityPercent: number | null;
  healthStatus: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'POSSIBLY_UNAVAILABLE';
  weightedScore: number;
  adminRankPenalty: number;
  adminHealthOverride: 'WORKING' | 'DEGRADED' | 'DOWN' | null;
}

export interface ServerWatchPostView {
  id: string;
  guildId: string;
  userId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  watchSourceId: string | null;
  sourceName: string | null;
  sourceType: WatchSourceRow['sourceType'] | null;
  accessType: WatchSourceRow['accessType'] | null;
  domain: string;
  homepageUrl: string;
  suggestedName: string;
  comment: string | null;
  contentKey: string | null;
  mediaType: 'ANIME' | 'MOVIE' | 'TV' | null;
  mediaTitle: string | null;
  supportsAnime: boolean;
  supportsMovies: boolean;
  supportsTv: boolean;
  createdAt: Date;
  ratingAverage: number | null;
  ratingCount: number;
  overallRatingAverage: number | null;
  overallRatingCount: number;
  reliabilityPercent: number | null;
  workingRecent: number;
  brokenRecent: number;
  healthStatus: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'POSSIBLY_UNAVAILABLE';
  weightedScore: number;
}

export interface OpenWatchReportView {
  id: string;
  reason: WatchReportReason;
  details: string | null;
  createdAt: Date;
  mediaWatchSourceId: string | null;
  watchSourceId: string | null;
  serverWatchPostId: string | null;
  domain: string | null;
  name: string | null;
}

export interface UpsertAvailabilityInput {
  watchSourceId: string;
  contentKey: string;
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  provider?: 'ANILIST' | 'JIKAN' | 'KITSU' | 'TMDB' | null;
  providerMediaId?: string | null;
  canonicalMediaKey?: string | null;
  availabilityUrl: string;
  quality?: MediaWatchSourceRow['quality'];
  audio?: MediaWatchSourceRow['audio'];
  subAvailable?: boolean | null;
  dubAvailable?: boolean | null;
  accessType?: WatchAccessType;
  priceLabel?: string | null;
  availabilityStatus?: WatchAvailabilityStatus;
  metadata?: unknown;
}

export interface UpsertImportedAvailabilityInput {
  watchSourceId: string;
  contentKey: string;
  mediaType: 'ANIME' | 'MOVIE' | 'TV';
  canonicalMediaKey?: string | null;
  availabilityUrl: string;
  accessType?: WatchAccessType;
  quality?: MediaWatchSourceRow['quality'];
  audio?: MediaWatchSourceRow['audio'];
  priceLabel?: string | null;
  availabilityStatus?: WatchAvailabilityStatus;
}

/**
 * Watch sources and per-title availability.
 *
 * Two invariants are enforced here rather than left to callers: a source domain
 * is stored normalised, and a URL that is not a safe external http(s) address
 * never reaches the database at all.
 */
function normalizeAdminHealth(value: string | null): 'WORKING' | 'DEGRADED' | 'DOWN' | null {
  return value === 'WORKING' || value === 'DEGRADED' || value === 'DOWN' ? value : null;
}

/** Wilson lower bound keeps one lucky like from outranking a proven source. */
function wilsonLikeScore(likes: number, dislikes: number): number {
  const n = likes + dislikes;
  if (n === 0) return 0;
  const z = 1.96;
  const p = likes / n;
  const z2 = z * z;
  return (
    p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  ) / (1 + z2 / n);
}

export class WatchSourceRepository {
  constructor(private readonly db: Database) {}

  async registerSource(
    input: Omit<NewWatchSource, 'domain' | 'homepageUrl'> & { homepageUrl: string },
  ): Promise<WatchSourceRow> {
    const homepageUrl = canonicalizeExternalUrl(input.homepageUrl);
    if (!homepageUrl) throw new Error('watch source homepage must be a valid http(s) URL');

    const domain = normalizeDomain(homepageUrl);
    if (!domain) throw new Error('watch source domain could not be normalised');

    const rows = await this.db
      .insert(watchSources)
      .values({ ...input, domain, homepageUrl })
      .onConflictDoUpdate({
        target: watchSources.domain,
        set: {
          name: input.name,
          homepageUrl,
          sourceType: input.sourceType,
          updatedAt: new Date(),
        },
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error('watch source insert returned no row');
    return row;
  }

  async findSourceByDomain(domain: string): Promise<WatchSourceRow | undefined> {
    const normalized = normalizeDomain(domain);
    if (!normalized) return undefined;
    const rows = await this.db
      .select()
      .from(watchSources)
      .where(eq(watchSources.domain, normalized))
      .limit(1);
    return rows[0];
  }

  /** Existing rows for a batch of domains, keyed by domain. */
  async findSourcesByDomains(domains: string[]): Promise<Map<string, WatchSourceRow>> {
    if (domains.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(watchSources)
      .where(inArray(watchSources.domain, domains));
    return new Map(rows.map((row) => [row.domain, row]));
  }

  /**
   * Import upsert.
   *
   * Only fields the operator actually supplied are written, so re-importing a
   * short row does not blank out metadata that was filled in later.
   */
  async upsertImportedSource(input: {
    domain: string;
    name?: string;
    homepageUrl?: string;
    sourceType?: WatchSourceType;
    origin?: WatchSourceOrigin;
    accessType?: WatchAccessType;
    originUrl?: string | null;
    supportsAnime?: boolean;
    supportsMovies?: boolean;
    supportsTv?: boolean;
    requiresAccount?: boolean;
    regionInfo?: string | null;
    isEnabled?: boolean;
  }): Promise<WatchSourceRow> {
    const existing = await this.findSourceByDomain(input.domain);

    if (existing) {
      const update: Partial<typeof watchSources.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) update.name = input.name;
      if (input.homepageUrl !== undefined) {
        const homepageUrl = canonicalizeExternalUrl(input.homepageUrl);
        if (!homepageUrl) throw new Error('watch source homepage must be a valid http(s) URL');
        update.homepageUrl = homepageUrl;
      }
      if (input.sourceType !== undefined) update.sourceType = input.sourceType;
      if (input.accessType !== undefined) update.accessType = input.accessType;
      if (input.origin !== undefined) update.origin = input.origin;
      if (input.originUrl !== undefined) update.originUrl = input.originUrl;
      if (input.supportsAnime !== undefined) update.supportsAnime = input.supportsAnime;
      if (input.supportsMovies !== undefined) update.supportsMovies = input.supportsMovies;
      if (input.supportsTv !== undefined) update.supportsTv = input.supportsTv;
      if (input.requiresAccount !== undefined) update.requiresAccount = input.requiresAccount;
      if (input.regionInfo !== undefined) update.regionInfo = input.regionInfo;
      if (input.isEnabled !== undefined) update.isEnabled = input.isEnabled;

      const rows = await this.db
        .update(watchSources)
        .set(update)
        .where(eq(watchSources.id, existing.id))
        .returning();
      const row = rows[0];
      if (!row) throw new Error('imported source update returned no row');
      return row;
    }

    const homepageUrl = canonicalizeExternalUrl(input.homepageUrl ?? `https://${input.domain}`);
    if (!homepageUrl) throw new Error('watch source homepage must be a valid http(s) URL');

    const rows = await this.db
      .insert(watchSources)
      .values({
        name: input.name ?? input.domain,
        domain: input.domain,
        homepageUrl,
        sourceType: input.sourceType ?? 'UNVERIFIED',
        accessType: input.accessType ?? 'UNKNOWN',
        origin: input.origin ?? 'MANUAL',
        originUrl: input.originUrl ?? null,
        supportsAnime: input.supportsAnime ?? false,
        supportsMovies: input.supportsMovies ?? false,
        supportsTv: input.supportsTv ?? false,
        requiresAccount: input.requiresAccount ?? false,
        regionInfo: input.regionInfo ?? null,
        // An import never asserts trust. Verification stays a separate decision.
        isVerified: false,
        isEnabled: input.isEnabled ?? false,
        discoveredAt: new Date(),
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error('imported source insert returned no row');
    return row;
  }

  /** Registry listing for the dev tools. */
  async listSources(options: {
    search?: string;
    sourceType?: WatchSourceType;
    isEnabled?: boolean;
    limit?: number;
  } = {}): Promise<WatchSourceRow[]> {
    const filters = [];
    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      filters.push(
        sql`(lower(${watchSources.name}) like ${term} or ${watchSources.domain} like ${term})`,
      );
    }
    if (options.sourceType) filters.push(eq(watchSources.sourceType, options.sourceType));
    if (options.isEnabled !== undefined) {
      filters.push(eq(watchSources.isEnabled, options.isEnabled));
    }

    return this.db
      .select()
      .from(watchSources)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(watchSources.domain))
      .limit(Math.min(options.limit ?? 100, 500));
  }


  async setSourceEnabled(sourceId: string, isEnabled: boolean): Promise<WatchSourceRow | undefined> {
    const rows = await this.db
      .update(watchSources)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(watchSources.id, sourceId))
      .returning();
    return rows[0];
  }

  /**
   * Availability rows for one canonical title.
   *
   * Disabled sources are filtered in the query, not in the view layer, so a
   * source that has been switched off cannot leak through a different caller.
   */
  async listingsForContent(contentKey: string): Promise<WatchListing[]> {
    const rows = await this.db
      .select({ listing: mediaWatchSources, source: watchSources })
      .from(mediaWatchSources)
      .innerJoin(watchSources, eq(mediaWatchSources.watchSourceId, watchSources.id))
      .where(and(eq(mediaWatchSources.contentKey, contentKey), eq(watchSources.isEnabled, true)));

    return rows;
  }

  async upsertAvailability(input: UpsertAvailabilityInput): Promise<MediaWatchSourceRow> {
    const availabilityUrl = canonicalizeExternalUrl(input.availabilityUrl);
    if (!availabilityUrl) throw new Error('availability URL must be a valid http(s) URL');

    const now = new Date();
    const rows = await this.db
      .insert(mediaWatchSources)
      .values({
        watchSourceId: input.watchSourceId,
        contentKey: input.contentKey,
        mediaType: input.mediaType,
        provider: input.provider ?? null,
        providerMediaId: input.providerMediaId ?? null,
        canonicalMediaKey: input.canonicalMediaKey ?? null,
        availabilityUrl,
        accessType: input.accessType ?? 'UNKNOWN',
        quality: input.quality ?? 'UNKNOWN',
        audio: input.audio ?? 'UNKNOWN',
        subAvailable: input.subAvailable ?? null,
        dubAvailable: input.dubAvailable ?? null,
        priceLabel: input.priceLabel ?? null,
        availabilityStatus: input.availabilityStatus ?? 'UNKNOWN',
        lastCheckedAt: now,
        lastSuccessAt: input.availabilityStatus === 'AVAILABLE' ? now : null,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [mediaWatchSources.contentKey, mediaWatchSources.watchSourceId],
        set: {
          availabilityUrl,
          accessType: input.accessType ?? 'UNKNOWN',
          quality: input.quality ?? 'UNKNOWN',
          audio: input.audio ?? 'UNKNOWN',
          subAvailable: input.subAvailable ?? null,
          dubAvailable: input.dubAvailable ?? null,
          priceLabel: input.priceLabel ?? null,
          availabilityStatus: input.availabilityStatus ?? 'UNKNOWN',
          lastCheckedAt: now,
          ...(input.availabilityStatus === 'AVAILABLE' ? { lastSuccessAt: now } : {}),
          metadata: input.metadata ?? null,
          updatedAt: now,
        },
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error('availability upsert returned no row');
    return row;
  }

  async findAvailability(
    contentKey: string,
    watchSourceId: string,
  ): Promise<MediaWatchSourceRow | undefined> {
    const rows = await this.db
      .select()
      .from(mediaWatchSources)
      .where(
        and(
          eq(mediaWatchSources.contentKey, contentKey),
          eq(mediaWatchSources.watchSourceId, watchSourceId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  /** Operator import variant that preserves fields omitted by a later update. */
  async upsertImportedAvailability(
    input: UpsertImportedAvailabilityInput,
  ): Promise<MediaWatchSourceRow> {
    const availabilityUrl = canonicalizeExternalUrl(input.availabilityUrl);
    if (!availabilityUrl) throw new Error('availability URL must be a valid http(s) URL');

    const existing = await this.findAvailability(input.contentKey, input.watchSourceId);
    const now = new Date();

    if (existing) {
      const update: Partial<typeof mediaWatchSources.$inferInsert> = {
        availabilityUrl,
        updatedAt: now,
        lastCheckedAt: now,
      };
      if (input.accessType !== undefined) update.accessType = input.accessType;
      if (input.quality !== undefined) update.quality = input.quality;
      if (input.audio !== undefined) update.audio = input.audio;
      if (input.priceLabel !== undefined) update.priceLabel = input.priceLabel;
      if (input.availabilityStatus !== undefined) {
        update.availabilityStatus = input.availabilityStatus;
        if (input.availabilityStatus === 'AVAILABLE') update.lastSuccessAt = now;
      }

      const rows = await this.db
        .update(mediaWatchSources)
        .set(update)
        .where(eq(mediaWatchSources.id, existing.id))
        .returning();
      const row = rows[0];
      if (!row) throw new Error('imported availability update returned no row');
      return row;
    }

    const rows = await this.db
      .insert(mediaWatchSources)
      .values({
        watchSourceId: input.watchSourceId,
        contentKey: input.contentKey,
        mediaType: input.mediaType,
        // Operator imports are not provider-refresh rows. The canonical
        // contentKey already identifies the title; leave provider provenance
        // null so an official API refresh can never retire a manual link.
        provider: null,
        providerMediaId: null,
        canonicalMediaKey: input.canonicalMediaKey ?? null,
        availabilityUrl,
        accessType: input.accessType ?? 'UNKNOWN',
        quality: input.quality ?? 'UNKNOWN',
        audio: input.audio ?? 'UNKNOWN',
        priceLabel: input.priceLabel ?? null,
        availabilityStatus: input.availabilityStatus ?? 'UNKNOWN',
        lastCheckedAt: now,
        lastSuccessAt: input.availabilityStatus === 'AVAILABLE' ? now : null,
        metadata: { origin: 'operator_import' },
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error('imported availability insert returned no row');
    return row;
  }

  /** True when this provider has not refreshed the title within the freshness window. */
  async isContentStale(
    contentKey: string,
    maxAgeMs: number,
    provider?: NonNullable<UpsertAvailabilityInput['provider']>,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const providerFilter = provider
      ? eq(mediaWatchSources.provider, provider)
      : isNotNull(mediaWatchSources.provider);

    const rows = await this.db
      .select({ id: mediaWatchSources.id })
      .from(mediaWatchSources)
      .where(
        and(
          eq(mediaWatchSources.contentKey, contentKey),
          providerFilter,
          or(isNull(mediaWatchSources.lastCheckedAt), lt(mediaWatchSources.lastCheckedAt, cutoff)),
        ),
      )
      .limit(1);

    if (rows.length > 0) return true;

    // No rows for the requested provider also means that provider has never
    // refreshed this title. Manual/operator rows never count as cache state.
    const existing = await this.db
      .select({ id: mediaWatchSources.id })
      .from(mediaWatchSources)
      .where(and(eq(mediaWatchSources.contentKey, contentKey), providerFilter))
      .limit(1);
    return existing.length === 0;
  }

  async markUnavailable(listingIds: string[]): Promise<void> {
    if (listingIds.length === 0) return;
    const now = new Date();
    await this.db
      .update(mediaWatchSources)
      .set({ availabilityStatus: 'RECENTLY_UNAVAILABLE', lastCheckedAt: now, updatedAt: now })
      .where(inArray(mediaWatchSources.id, listingIds));
  }

  /**
   * Records a discovered source for later review. Returns null for unsafe URLs
   * and duplicate pending submissions so community clicks cannot create noise.
   */
  async recordCandidate(input: {
    homepageUrl: string;
    suggestedName: string;
    origin: WatchSourceOrigin;
    originUrl?: string | null;
    submittedByUserId?: string | null;
    guildId?: string | null;
    supportsAnime?: boolean;
    supportsMovies?: boolean;
    supportsTv?: boolean;
    comment?: string | null;
    contentKey?: string | null;
    mediaType?: 'ANIME' | 'MOVIE' | 'TV' | null;
    mediaTitle?: string | null;
    availabilityUrl?: string | null;
  }): Promise<{ id: string; domain: string } | null> {
    const homepageUrl = canonicalizeExternalUrl(input.homepageUrl);
    if (!homepageUrl) return null;

    const domain = normalizeDomain(homepageUrl);
    if (!domain) return null;

    const availabilityUrl = input.availabilityUrl
      ? canonicalizeExternalUrl(input.availabilityUrl)
      : null;
    if (input.availabilityUrl && !availabilityUrl) return null;

    // Keep one moderation card per domain. Repeated pending submissions do not
    // create noise, while an old approved/rejected card can be reopened when a
    // member later suggests the same source for a different title.
    const existingCandidates = await this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.domain, domain))
      .limit(1);
    const existingCandidate = existingCandidates[0];
    if (existingCandidate?.status === 'PENDING') return null;

    const values = {
      suggestedName: input.suggestedName.slice(0, 120),
      homepageUrl,
      origin: input.origin,
      originUrl: input.originUrl ?? null,
      submittedByUserId: input.submittedByUserId ?? null,
      guildId: input.guildId ?? null,
      supportsAnime: input.supportsAnime ?? false,
      supportsMovies: input.supportsMovies ?? false,
      supportsTv: input.supportsTv ?? false,
      comment: input.comment?.slice(0, 500) ?? null,
      contentKey: input.contentKey ?? null,
      mediaType: input.mediaType ?? null,
      mediaTitle: input.mediaTitle?.slice(0, 180) ?? null,
      availabilityUrl,
    };

    if (existingCandidate) {
      const rows = await this.db
        .update(watchSourceCandidates)
        .set({
          ...values,
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNotes: null,
          promotedSourceId: null,
          discoveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(watchSourceCandidates.id, existingCandidate.id))
        .returning({ id: watchSourceCandidates.id, domain: watchSourceCandidates.domain });
      return rows[0] ?? null;
    }

    const rows = await this.db
      .insert(watchSourceCandidates)
      .values({ domain, ...values })
      .onConflictDoNothing()
      .returning({ id: watchSourceCandidates.id, domain: watchSourceCandidates.domain });

    return rows[0] ?? null;
  }

  async pendingCandidates(limit = 50): Promise<Array<typeof watchSourceCandidates.$inferSelect>> {
    return this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.status, 'PENDING'))
      .orderBy(asc(watchSourceCandidates.discoveredAt))
      .limit(limit);
  }

  /**
   * Approving a candidate creates the registry row but leaves it disabled: a
   * second, deliberate step turns a source on.
   */
  async approveCandidate(input: {
    candidateId: string;
    reviewerUserId: string;
    sourceType: WatchSourceType;
    supportsAnime: boolean;
    supportsMovies: boolean;
    supportsTv: boolean;
    notes?: string | null;
  }): Promise<WatchSourceRow | null> {
    const rows = await this.db
      .select()
      .from(watchSourceCandidates)
      .where(eq(watchSourceCandidates.id, input.candidateId))
      .limit(1);

    const candidate = rows[0];
    if (!candidate || candidate.status !== 'PENDING') return null;

    const existingSource = await this.findSourceByDomain(candidate.domain);
    const source = existingSource
      ? (await this.updateSource({
          sourceId: existingSource.id,
          supportsAnime: existingSource.supportsAnime || input.supportsAnime,
          supportsMovies: existingSource.supportsMovies || input.supportsMovies,
          supportsTv: existingSource.supportsTv || input.supportsTv,
        })) ?? existingSource
      : await this.registerSource({
          name: candidate.suggestedName,
          homepageUrl: candidate.homepageUrl,
          sourceType: input.sourceType,
          supportsAnime: input.supportsAnime,
          supportsMovies: input.supportsMovies,
          supportsTv: input.supportsTv,
          origin: candidate.origin,
          originUrl: candidate.originUrl,
          discoveredAt: candidate.discoveredAt,
          isVerified: false,
          isEnabled: false,
        });

    // A title-specific suggestion is still only metadata until an operator
    // approves it. Approval attaches it to the canonical title with UNKNOWN
    // availability rather than pretending Couchlist independently verified it.
    if (candidate.contentKey && candidate.mediaType && candidate.availabilityUrl) {
      await this.upsertImportedAvailability({
        watchSourceId: source.id,
        contentKey: candidate.contentKey,
        mediaType: candidate.mediaType,
        canonicalMediaKey: candidate.contentKey.startsWith('CANONICAL:')
          ? candidate.contentKey.slice('CANONICAL:'.length)
          : null,
        availabilityUrl: candidate.availabilityUrl,
        availabilityStatus: 'UNKNOWN',
      });
    }

    await this.db
      .update(watchSourceCandidates)
      .set({
        status: 'APPROVED',
        reviewedByUserId: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.notes ?? null,
        promotedSourceId: source.id,
        updatedAt: new Date(),
      })
      .where(eq(watchSourceCandidates.id, input.candidateId));

    return source;
  }

  async rejectCandidate(
    candidateId: string,
    reviewerUserId: string,
    notes?: string | null,
  ): Promise<void> {
    await this.db
      .update(watchSourceCandidates)
      .set({
        status: 'REJECTED',
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(watchSourceCandidates.id, candidateId));
  }

  /**
   * Files a report. Reports accumulate for a human to act on; nothing is hidden
   * or deleted as a side effect of reporting.
   */
  async createReport(input: {
    mediaWatchSourceId?: string | null;
    watchSourceId?: string | null;
    serverWatchPostId?: string | null;
    reportedByUserId: string;
    reason: WatchReportReason;
    details?: string | null;
  }): Promise<{ id: string } | null> {
    const targets = [input.mediaWatchSourceId, input.watchSourceId, input.serverWatchPostId].filter(Boolean);
    if (targets.length !== 1) throw new Error('watch report requires exactly one target');

    const rows = await this.db
      .insert(watchSourceReports)
      .values({
        mediaWatchSourceId: input.mediaWatchSourceId ?? null,
        watchSourceId: input.watchSourceId ?? null,
        serverWatchPostId: input.serverWatchPostId ?? null,
        reportedByUserId: input.reportedByUserId,
        reason: input.reason,
        details: input.details?.slice(0, 500) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: watchSourceReports.id });

    return rows[0] ?? null;
  }

  async openReportCount(mediaWatchSourceId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchSourceReports)
      .where(
        and(
          eq(watchSourceReports.mediaWatchSourceId, mediaWatchSourceId),
          isNull(watchSourceReports.resolvedAt),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  async updateSource(input: {
    sourceId: string;
    name?: string;
    sourceType?: WatchSourceType;
    accessType?: WatchAccessType;
    supportsAnime?: boolean;
    supportsMovies?: boolean;
    supportsTv?: boolean;
    isEnabled?: boolean;
    adminRankPenalty?: number;
    adminHealthOverride?: 'WORKING' | 'DEGRADED' | 'DOWN' | null;
  }): Promise<WatchSourceRow | undefined> {
    const update: Partial<typeof watchSources.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) update.name = input.name.slice(0, 120);
    if (input.sourceType !== undefined) update.sourceType = input.sourceType;
    if (input.accessType !== undefined) update.accessType = input.accessType;
    if (input.supportsAnime !== undefined) update.supportsAnime = input.supportsAnime;
    if (input.supportsMovies !== undefined) update.supportsMovies = input.supportsMovies;
    if (input.supportsTv !== undefined) update.supportsTv = input.supportsTv;
    if (input.isEnabled !== undefined) update.isEnabled = input.isEnabled;
    if (input.adminRankPenalty !== undefined) update.adminRankPenalty = Math.max(0, Math.min(100, input.adminRankPenalty));
    if (input.adminHealthOverride !== undefined) update.adminHealthOverride = input.adminHealthOverride;

    const rows = await this.db
      .update(watchSources)
      .set(update)
      .where(eq(watchSources.id, input.sourceId))
      .returning();
    return rows[0];
  }

  /** Aggregate ratings, simple like/dislike sentiment, and recent health votes. */
  async sourceStats(
    sourceIds: string[],
    guildId: string | null = null,
  ): Promise<Map<string, WatchSourceStats>> {
    const result = new Map<string, WatchSourceStats>();
    if (sourceIds.length === 0) return result;

    const [ratingRows, sourceControlRows] = await Promise.all([
      this.db
        .select({
          sourceId: watchSourceRatings.watchSourceId,
          average: sql<number>`avg(${watchSourceRatings.rating})::float8`,
          count: sql<number>`count(*)::int`,
          likes: sql<number>`count(*) filter (where ${watchSourceRatings.rating} >= 4)::int`,
          dislikes: sql<number>`count(*) filter (where ${watchSourceRatings.rating} <= 2)::int`,
        })
        .from(watchSourceRatings)
        .where(
          and(
            inArray(watchSourceRatings.watchSourceId, sourceIds),
            guildId ? eq(watchSourceRatings.guildId, guildId) : isNull(watchSourceRatings.guildId),
          ),
        )
        .groupBy(watchSourceRatings.watchSourceId),
      this.db
        .select({
          id: watchSources.id,
          adminRankPenalty: watchSources.adminRankPenalty,
          adminHealthOverride: watchSources.adminHealthOverride,
        })
        .from(watchSources)
        .where(inArray(watchSources.id, sourceIds)),
    ]);

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const healthRows = await this.db
      .select({
        sourceId: watchSourceHealthVotes.watchSourceId,
        working: sql<number>`count(*) filter (where ${watchSourceHealthVotes.status} = 'WORKING')::int`,
        broken: sql<number>`count(*) filter (where ${watchSourceHealthVotes.status} = 'BROKEN')::int`,
      })
      .from(watchSourceHealthVotes)
      .where(
        and(
          inArray(watchSourceHealthVotes.watchSourceId, sourceIds),
          gte(watchSourceHealthVotes.updatedAt, cutoff),
          guildId
            ? eq(watchSourceHealthVotes.guildId, guildId)
            : isNull(watchSourceHealthVotes.guildId),
        ),
      )
      .groupBy(watchSourceHealthVotes.watchSourceId);

    const ratings = new Map(
      ratingRows
        .filter((row) => row.sourceId !== null)
        .map((row) => [row.sourceId!, {
          average: Number(row.average),
          count: row.count,
          likes: row.likes,
          dislikes: row.dislikes,
        }]),
    );
    const health = new Map(
      healthRows
        .filter((row) => row.sourceId !== null)
        .map((row) => [row.sourceId!, { working: row.working, broken: row.broken }]),
    );
    const controls = new Map(sourceControlRows.map((row) => [row.id, row]));

    for (const sourceId of sourceIds) {
      const rating = ratings.get(sourceId);
      const signal = health.get(sourceId) ?? { working: 0, broken: 0 };
      const control = controls.get(sourceId);
      const totalHealth = signal.working + signal.broken;
      const reliabilityPercent = totalHealth > 0 ? Math.round((signal.working / totalHealth) * 100) : null;
      const average = rating ? Number(rating.average.toFixed(2)) : null;
      const ratingCount = rating?.count ?? 0;
      const likes = rating?.likes ?? 0;
      const dislikes = rating?.dislikes ?? 0;
      const sentimentVotes = likes + dislikes;
      const likePercent = sentimentVotes > 0 ? Math.round((likes / sentimentVotes) * 100) : null;
      const adminRankPenalty = control?.adminRankPenalty ?? 0;
      const adminHealthOverride = normalizeAdminHealth(control?.adminHealthOverride ?? null);
      const automaticHealth = watchHealthStatus(signal.broken);
      const healthStatus = adminHealthOverride === 'DOWN'
        ? 'POSSIBLY_UNAVAILABLE'
        : adminHealthOverride === 'DEGRADED'
          ? 'DEGRADED'
          : adminHealthOverride === 'WORKING'
            ? 'HEALTHY'
            : automaticHealth;
      const healthPenalty = healthStatus === 'POSSIBLY_UNAVAILABLE' ? 1.5 : healthStatus === 'DEGRADED' ? 0.75 : healthStatus === 'WATCH' ? 0.3 : 0;
      const sentimentScore = wilsonLikeScore(likes, dislikes) * 100 - adminRankPenalty - healthPenalty * 8;
      result.set(sourceId, {
        ratingAverage: average,
        ratingCount,
        likes,
        dislikes,
        likePercent,
        sentimentScore,
        workingRecent: signal.working,
        brokenRecent: signal.broken,
        reliabilityPercent,
        healthStatus,
        weightedScore: weightedWatchRating(average, ratingCount) - healthPenalty - adminRankPenalty / 25,
        adminRankPenalty,
        adminHealthOverride,
      });
    }

    return result;
  }

  async setSourceRating(input: {
    watchSourceId: string;
    userId: string;
    guildId?: string | null;
    rating: number;
  }): Promise<void> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error('rating must be an integer from 1 to 5');
    }
    const scope = input.guildId ?? null;
    const existing = await this.db
      .select({ id: watchSourceRatings.id })
      .from(watchSourceRatings)
      .where(
        and(
          eq(watchSourceRatings.watchSourceId, input.watchSourceId),
          eq(watchSourceRatings.userId, input.userId),
          scope ? eq(watchSourceRatings.guildId, scope) : isNull(watchSourceRatings.guildId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await this.db
        .update(watchSourceRatings)
        .set({ rating: input.rating, updatedAt: new Date() })
        .where(eq(watchSourceRatings.id, existing[0].id));
      return;
    }
    await this.db.insert(watchSourceRatings).values({
      watchSourceId: input.watchSourceId,
      userId: input.userId,
      guildId: scope,
      rating: input.rating,
    });
  }

  async setSourceHealth(input: {
    watchSourceId: string;
    userId: string;
    guildId?: string | null;
    status: 'WORKING' | 'BROKEN';
    reason?: WatchReportReason | null;
  }): Promise<void> {
    const scope = input.guildId ?? null;
    const existing = await this.db
      .select({ id: watchSourceHealthVotes.id })
      .from(watchSourceHealthVotes)
      .where(
        and(
          eq(watchSourceHealthVotes.watchSourceId, input.watchSourceId),
          eq(watchSourceHealthVotes.userId, input.userId),
          scope ? eq(watchSourceHealthVotes.guildId, scope) : isNull(watchSourceHealthVotes.guildId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await this.db
        .update(watchSourceHealthVotes)
        .set({ status: input.status, reason: input.reason ?? null, updatedAt: new Date() })
        .where(eq(watchSourceHealthVotes.id, existing[0].id));
      return;
    }
    await this.db.insert(watchSourceHealthVotes).values({
      watchSourceId: input.watchSourceId,
      userId: input.userId,
      guildId: scope,
      status: input.status,
      reason: input.reason ?? null,
    });
  }

  async findServerPostById(id: string) {
    const rows = await this.db
      .select()
      .from(serverWatchPosts)
      .where(eq(serverWatchPosts.id, id))
      .limit(1);
    return rows[0];
  }

  async shareWithServer(input: {
    guildId: string;
    userId: string;
    homepageUrl: string;
    suggestedName?: string | null;
    comment?: string | null;
    contentKey?: string | null;
    mediaType?: 'ANIME' | 'MOVIE' | 'TV' | null;
    mediaTitle?: string | null;
    supportsAnime?: boolean;
    supportsMovies?: boolean;
    supportsTv?: boolean;
  }): Promise<{ id: string; domain: string }> {
    const homepageUrl = canonicalizeExternalUrl(input.homepageUrl);
    if (!homepageUrl) throw new Error('source URL must be a valid public http(s) URL');
    const domain = normalizeDomain(homepageUrl);
    if (!domain) throw new Error('source domain could not be normalized');
    const source = await this.findSourceByDomain(domain);
    const name = (input.suggestedName?.trim() || source?.name || domain).slice(0, 120);

    const existing = await this.db
      .select({ id: serverWatchPosts.id })
      .from(serverWatchPosts)
      .where(
        and(
          eq(serverWatchPosts.guildId, input.guildId),
          eq(serverWatchPosts.userId, input.userId),
          eq(serverWatchPosts.domain, domain),
          eq(serverWatchPosts.isHidden, false),
        ),
      )
      .limit(1);

    const hasDeclaredCoverage = Boolean(
      input.supportsAnime || input.supportsMovies || input.supportsTv,
    );
    const values = {
      watchSourceId: source?.id ?? null,
      homepageUrl,
      suggestedName: name,
      comment: input.comment?.slice(0, 500) ?? null,
      contentKey: input.contentKey ?? null,
      mediaType: input.mediaType ?? null,
      mediaTitle: input.mediaTitle?.slice(0, 180) ?? null,
      supportsAnime: hasDeclaredCoverage ? Boolean(input.supportsAnime) : (source?.supportsAnime ?? false),
      supportsMovies: hasDeclaredCoverage ? Boolean(input.supportsMovies) : (source?.supportsMovies ?? false),
      supportsTv: hasDeclaredCoverage ? Boolean(input.supportsTv) : (source?.supportsTv ?? false),
      updatedAt: new Date(),
    };

    if (existing[0]) {
      const rows = await this.db
        .update(serverWatchPosts)
        .set(values)
        .where(eq(serverWatchPosts.id, existing[0].id))
        .returning({ id: serverWatchPosts.id, domain: serverWatchPosts.domain });
      return rows[0]!;
    }

    const rows = await this.db
      .insert(serverWatchPosts)
      .values({ guildId: input.guildId, userId: input.userId, domain, ...values })
      .returning({ id: serverWatchPosts.id, domain: serverWatchPosts.domain });
    return rows[0]!;
  }

  async setPostRating(input: {
    serverWatchPostId: string;
    userId: string;
    guildId: string;
    rating: number;
  }): Promise<void> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new Error('rating must be an integer from 1 to 5');
    }
    const existing = await this.db
      .select({ id: watchSourceRatings.id })
      .from(watchSourceRatings)
      .where(
        and(
          eq(watchSourceRatings.serverWatchPostId, input.serverWatchPostId),
          eq(watchSourceRatings.userId, input.userId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await this.db
        .update(watchSourceRatings)
        .set({ rating: input.rating, updatedAt: new Date() })
        .where(eq(watchSourceRatings.id, existing[0].id));
      return;
    }
    await this.db.insert(watchSourceRatings).values({
      serverWatchPostId: input.serverWatchPostId,
      userId: input.userId,
      guildId: input.guildId,
      rating: input.rating,
    });
  }

  async setPostHealth(input: {
    serverWatchPostId: string;
    userId: string;
    guildId: string;
    status: 'WORKING' | 'BROKEN';
    reason?: WatchReportReason | null;
  }): Promise<void> {
    const existing = await this.db
      .select({ id: watchSourceHealthVotes.id })
      .from(watchSourceHealthVotes)
      .where(
        and(
          eq(watchSourceHealthVotes.serverWatchPostId, input.serverWatchPostId),
          eq(watchSourceHealthVotes.userId, input.userId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await this.db
        .update(watchSourceHealthVotes)
        .set({ status: input.status, reason: input.reason ?? null, updatedAt: new Date() })
        .where(eq(watchSourceHealthVotes.id, existing[0].id));
      return;
    }
    await this.db.insert(watchSourceHealthVotes).values({
      serverWatchPostId: input.serverWatchPostId,
      userId: input.userId,
      guildId: input.guildId,
      status: input.status,
      reason: input.reason ?? null,
    });
  }

  async listServerPosts(guildId: string): Promise<ServerWatchPostView[]> {
    const rows = await this.db
      .select({ post: serverWatchPosts, user: users, source: watchSources })
      .from(serverWatchPosts)
      .innerJoin(users, eq(serverWatchPosts.userId, users.id))
      .leftJoin(watchSources, eq(serverWatchPosts.watchSourceId, watchSources.id))
      .where(and(eq(serverWatchPosts.guildId, guildId), eq(serverWatchPosts.isHidden, false)))
      .orderBy(desc(serverWatchPosts.createdAt))
      .limit(100);

    const sourceIds = [...new Set(rows.flatMap((row) => (row.source ? [row.source.id] : [])))];
    const [serverSourceStats, globalSourceStats] = await Promise.all([
      this.sourceStats(sourceIds, guildId),
      this.sourceStats(sourceIds, null),
    ]);

    const postIds = rows.filter((row) => !row.source).map((row) => row.post.id);
    const postStats = await this.postStats(postIds);

    return rows.map(({ post, user, source }) => {
      const serverStats = source ? serverSourceStats.get(source.id) : postStats.get(post.id);
      const globalStats = source ? globalSourceStats.get(source.id) : undefined;
      const empty: WatchSourceStats = {
        ratingAverage: null,
        ratingCount: 0,
        likes: 0,
        dislikes: 0,
        likePercent: null,
        sentimentScore: 0,
        workingRecent: 0,
        brokenRecent: 0,
        reliabilityPercent: null,
        healthStatus: 'HEALTHY',
        weightedScore: 0,
        adminRankPenalty: 0,
        adminHealthOverride: null,
      };
      const stats = serverStats ?? empty;
      return {
        id: post.id,
        guildId: post.guildId,
        userId: post.userId,
        username: user.username,
        globalName: user.globalName,
        avatarUrl: user.avatarUrl,
        watchSourceId: source?.id ?? null,
        sourceName: source?.name ?? null,
        sourceType: source?.sourceType ?? null,
        accessType: source?.accessType ?? null,
        domain: post.domain,
        homepageUrl: post.homepageUrl,
        suggestedName: post.suggestedName,
        comment: post.comment,
        contentKey: post.contentKey,
        mediaType: post.mediaType,
        mediaTitle: post.mediaTitle,
        supportsAnime: post.supportsAnime,
        supportsMovies: post.supportsMovies,
        supportsTv: post.supportsTv,
        createdAt: post.createdAt,
        ratingAverage: stats.ratingAverage,
        ratingCount: stats.ratingCount,
        overallRatingAverage: globalStats?.ratingAverage ?? null,
        overallRatingCount: globalStats?.ratingCount ?? 0,
        reliabilityPercent: stats.reliabilityPercent,
        workingRecent: stats.workingRecent,
        brokenRecent: stats.brokenRecent,
        healthStatus: stats.healthStatus,
        weightedScore: stats.weightedScore,
      };
    });
  }

  private async postStats(postIds: string[]): Promise<Map<string, WatchSourceStats>> {
    const result = new Map<string, WatchSourceStats>();
    if (postIds.length === 0) return result;
    const ratingRows = await this.db
      .select({
        postId: watchSourceRatings.serverWatchPostId,
        average: sql<number>`avg(${watchSourceRatings.rating})::float8`,
        count: sql<number>`count(*)::int`,
        likes: sql<number>`count(*) filter (where ${watchSourceRatings.rating} >= 4)::int`,
        dislikes: sql<number>`count(*) filter (where ${watchSourceRatings.rating} <= 2)::int`,
      })
      .from(watchSourceRatings)
      .where(inArray(watchSourceRatings.serverWatchPostId, postIds))
      .groupBy(watchSourceRatings.serverWatchPostId);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const healthRows = await this.db
      .select({
        postId: watchSourceHealthVotes.serverWatchPostId,
        working: sql<number>`count(*) filter (where ${watchSourceHealthVotes.status} = 'WORKING')::int`,
        broken: sql<number>`count(*) filter (where ${watchSourceHealthVotes.status} = 'BROKEN')::int`,
      })
      .from(watchSourceHealthVotes)
      .where(
        and(
          inArray(watchSourceHealthVotes.serverWatchPostId, postIds),
          gte(watchSourceHealthVotes.updatedAt, cutoff),
        ),
      )
      .groupBy(watchSourceHealthVotes.serverWatchPostId);
    const ratings = new Map(ratingRows.filter((r) => r.postId).map((r) => [r.postId!, r]));
    const health = new Map(healthRows.filter((r) => r.postId).map((r) => [r.postId!, r]));
    for (const id of postIds) {
      const rating = ratings.get(id);
      const signal = health.get(id) ?? { working: 0, broken: 0 };
      const total = signal.working + signal.broken;
      const average = rating ? Number(Number(rating.average).toFixed(2)) : null;
      const count = rating?.count ?? 0;
      const likes = rating?.likes ?? 0;
      const dislikes = rating?.dislikes ?? 0;
      const sentimentVotes = likes + dislikes;
      const healthStatus = watchHealthStatus(signal.broken);
      const penalty = healthStatus === 'POSSIBLY_UNAVAILABLE' ? 1.5 : healthStatus === 'DEGRADED' ? 0.75 : healthStatus === 'WATCH' ? 0.3 : 0;
      result.set(id, {
        ratingAverage: average,
        ratingCount: count,
        likes,
        dislikes,
        likePercent: sentimentVotes ? Math.round((likes / sentimentVotes) * 100) : null,
        sentimentScore: wilsonLikeScore(likes, dislikes) * 100 - penalty * 8,
        workingRecent: signal.working,
        brokenRecent: signal.broken,
        reliabilityPercent: total ? Math.round((signal.working / total) * 100) : null,
        healthStatus,
        weightedScore: weightedWatchRating(average, count) - penalty,
        adminRankPenalty: 0,
        adminHealthOverride: null,
      });
    }
    return result;
  }

  async promoteServerPostToCandidate(serverWatchPostId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(serverWatchPosts)
      .where(eq(serverWatchPosts.id, serverWatchPostId))
      .limit(1);
    const post = rows[0];
    if (!post) return false;
    const candidate = await this.recordCandidate({
      homepageUrl: post.homepageUrl,
      suggestedName: post.suggestedName,
      origin: 'COMMUNITY',
      submittedByUserId: userId,
      guildId: post.guildId,
      supportsAnime: post.supportsAnime,
      supportsMovies: post.supportsMovies,
      supportsTv: post.supportsTv,
      comment: post.comment,
      contentKey: post.contentKey,
      mediaType: post.mediaType,
      mediaTitle: post.mediaTitle,
      availabilityUrl: post.homepageUrl,
    });
    return candidate !== null;
  }

  async hideServerPost(serverWatchPostId: string): Promise<void> {
    await this.db
      .update(serverWatchPosts)
      .set({ isHidden: true, updatedAt: new Date() })
      .where(eq(serverWatchPosts.id, serverWatchPostId));
  }

  async openReports(limit = 100): Promise<OpenWatchReportView[]> {
    const rows = await this.db
      .select({ report: watchSourceReports, source: watchSources, post: serverWatchPosts, listing: mediaWatchSources })
      .from(watchSourceReports)
      .leftJoin(watchSources, eq(watchSourceReports.watchSourceId, watchSources.id))
      .leftJoin(serverWatchPosts, eq(watchSourceReports.serverWatchPostId, serverWatchPosts.id))
      .leftJoin(mediaWatchSources, eq(watchSourceReports.mediaWatchSourceId, mediaWatchSources.id))
      .where(isNull(watchSourceReports.resolvedAt))
      .orderBy(desc(watchSourceReports.createdAt))
      .limit(Math.min(limit, 300));

    const listingSourceIds = [...new Set(rows.flatMap((row) => row.listing ? [row.listing.watchSourceId] : []))];
    const listingSources = await this.findSourcesByIds(listingSourceIds);
    return rows.map(({ report, source, post, listing }) => {
      const listingSource = listing ? listingSources.get(listing.watchSourceId) : undefined;
      return {
        id: report.id,
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt,
        mediaWatchSourceId: report.mediaWatchSourceId,
        watchSourceId: report.watchSourceId ?? listingSource?.id ?? null,
        serverWatchPostId: report.serverWatchPostId,
        domain: source?.domain ?? post?.domain ?? listingSource?.domain ?? null,
        name: source?.name ?? post?.suggestedName ?? listingSource?.name ?? null,
      };
    });
  }

  async resolveReport(reportId: string, reviewerUserId: string): Promise<void> {
    await this.db
      .update(watchSourceReports)
      .set({ resolvedAt: new Date(), resolvedByUserId: reviewerUserId })
      .where(eq(watchSourceReports.id, reportId));
  }

  private async findSourcesByIds(ids: string[]): Promise<Map<string, WatchSourceRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(watchSources).where(inArray(watchSources.id, ids));
    return new Map(rows.map((row) => [row.id, row]));
  }

}
