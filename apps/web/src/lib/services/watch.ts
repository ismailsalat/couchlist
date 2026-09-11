import 'server-only';
import {
  AniListClient,
  AppError,
  JikanClient,
  KitsuClient,
  MediaProvider,
  MediaType,
  TmdbClient,
  canonicalizeExternalUrl,
  createLogger,
  mediaContentKey,
  normalizeDomain,
  WatchAccessType,
  WatchSourceType,
  type MediaIdentity,
  type ProviderWatchLink,
  type WatchOption,
} from '@couchlist/shared';
import { config } from '../config';
import { repos } from '../db';

/**
 * Where-to-watch data for a title.
 *
 * A page load reads the database only. Refreshing from providers happens when
 * the cached rows are stale, is capped per request, and failures degrade to
 * "we have nothing right now" rather than breaking the media page.
 */
const log = createLogger({ service: 'web' });

/** How long cached availability is treated as fresh. */
const AVAILABILITY_TTL_MS = 12 * 60 * 60 * 1000;

/** Empty-but-successful provider lookups are retried less aggressively. */
const EMPTY_REFRESH_TTL_MS = 60 * 60 * 1000;

/** Upper bound on provider calls triggered by one page view. */
const MAX_REFRESH_CALLS = 2;

/**
 * Refresh attempts in flight or recently completed, keyed by content and provider.
 *
 * Without this, ten people opening the same title at the same moment would each
 * start their own provider fetch.
 */
const refreshInFlight = new Map<string, Promise<void>>();
const emptyRefreshUntil = new Map<string, number>();

export interface WatchSectionData {
  options: WatchOption[];
  /** True when providers could not be reached and the list may be incomplete. */
  degraded: boolean;
  /** Set when TMDB supplied data, which carries an attribution requirement. */
  requiresJustWatchAttribution: boolean;
}

export async function getWatchOptions(
  identity: MediaIdentity,
  canonicalMediaKey: string | null,
): Promise<WatchSectionData> {
  const contentKey = mediaContentKey({ ...identity, canonicalMediaKey });
  const { watchSources } = repos();

  let degraded = false;

  try {
    if (
      (await watchSources.isContentStale(contentKey, AVAILABILITY_TTL_MS, identity.provider)) &&
      !hasFreshEmptyRefresh(contentKey, identity.provider)
    ) {
      await refreshOnce(contentKey, identity, canonicalMediaKey);
    }
  } catch (error) {
    // A refresh failure is not a page failure: fall through and show whatever
    // is already cached.
    degraded = true;
    log.warn('watch_refresh_failed', {
      contentKey,
      message: (error as Error)?.message,
    });
  }

  let listings;
  let directorySources;
  try {
    [listings, directorySources] = await Promise.all([
      watchSources.listingsForContent(contentKey),
      watchSources.listSources({ isEnabled: true, limit: 500 }),
    ]);
  } catch (error) {
    log.error('watch_listings_failed', {
      contentKey,
      message: (error as Error)?.message,
    });
    return { options: [], degraded: true, requiresJustWatchAttribution: false };
  }

  const listedSourceIds = new Set(listings.map(({ source }) => source.id));
  const matchingDirectorySources = directorySources.filter((source) => {
    if (listedSourceIds.has(source.id)) return false;
    if (identity.mediaType === 'ANIME') return source.supportsAnime;
    if (identity.mediaType === 'MOVIE') return source.supportsMovies;
    return source.supportsTv;
  });
  const sourceIds = [...new Set([
    ...listings.map(({ source }) => source.id),
    ...matchingDirectorySources.map((source) => source.id),
  ])];
  const stats = await watchSources.sourceStats(sourceIds, null);

  const confirmedOptions: WatchOption[] = listings.map(({ listing, source }) => {
    const sourceStats = stats.get(source.id);
    return {
      id: listing.id,
      sourceId: source.id,
      name: source.name,
      domain: source.domain,
      sourceType: source.sourceType,
      accessType: listing.accessType,
      quality: listing.quality,
      audio: listing.audio,
      priceLabel: listing.priceLabel,
      regionInfo: source.regionInfo,
      availabilityUrl: listing.availabilityUrl,
      availabilityStatus: listing.availabilityStatus,
      lastCheckedAt: listing.lastCheckedAt,
      requiresAccount: source.requiresAccount,
      isVerified: source.isVerified,
      allowsEmbed: source.allowsEmbed,
      supportsAnime: source.supportsAnime,
      supportsMovies: source.supportsMovies,
      supportsTv: source.supportsTv,
      ratingAverage: sourceStats?.ratingAverage ?? null,
      ratingCount: sourceStats?.ratingCount ?? 0,
      reliabilityPercent: sourceStats?.reliabilityPercent ?? null,
      workingRecent: sourceStats?.workingRecent ?? 0,
      brokenRecent: sourceStats?.brokenRecent ?? 0,
      healthStatus: sourceStats?.healthStatus ?? 'HEALTHY',
      providerOptions: providerOptionsFromMetadata(listing.metadata),
    };
  });

  const directoryOptions: WatchOption[] = matchingDirectorySources.map((source) => {
    const sourceStats = stats.get(source.id);
    return {
      id: `directory:${source.id}`,
      sourceId: source.id,
      name: source.name,
      domain: source.domain,
      sourceType: source.sourceType,
      accessType: source.accessType,
      quality: 'UNKNOWN',
      audio: 'UNKNOWN',
      priceLabel: null,
      regionInfo: source.regionInfo,
      availabilityUrl: source.homepageUrl,
      availabilityStatus: 'UNKNOWN',
      lastCheckedAt: null,
      requiresAccount: source.requiresAccount,
      isVerified: source.isVerified,
      allowsEmbed: source.allowsEmbed,
      supportsAnime: source.supportsAnime,
      supportsMovies: source.supportsMovies,
      supportsTv: source.supportsTv,
      ratingAverage: sourceStats?.ratingAverage ?? null,
      ratingCount: sourceStats?.ratingCount ?? 0,
      reliabilityPercent: sourceStats?.reliabilityPercent ?? null,
      workingRecent: sourceStats?.workingRecent ?? 0,
      brokenRecent: sourceStats?.brokenRecent ?? 0,
      healthStatus: sourceStats?.healthStatus ?? 'HEALTHY',
      directoryOnly: true,
    };
  });

  const options = [...confirmedOptions, ...directoryOptions];

  const requiresJustWatchAttribution = listings.some(
    ({ listing }) =>
      typeof listing.metadata === 'object' &&
      listing.metadata !== null &&
      (listing.metadata as { attribution?: string }).attribution === 'justwatch',
  );

  return { options, degraded, requiresJustWatchAttribution };
}

/** Collapses concurrent refreshes for the same title into one provider call. */
function refreshOnce(
  contentKey: string,
  identity: MediaIdentity,
  canonicalMediaKey: string | null,
): Promise<void> {
  const key = refreshCacheKey(contentKey, identity.provider);
  const existing = refreshInFlight.get(key);
  if (existing) return existing;

  const task = refreshFromProviders(contentKey, identity, canonicalMediaKey).finally(() => {
    refreshInFlight.delete(key);
  });
  refreshInFlight.set(key, task);
  return task;
}

async function refreshFromProviders(
  contentKey: string,
  identity: MediaIdentity,
  canonicalMediaKey: string | null,
): Promise<void> {
  const fetched = await fetchProviderLinks(identity);
  if (fetched.attempted === 0) return;
  if (fetched.failed === fetched.attempted) {
    throw new Error(`watch provider ${identity.provider} could not be refreshed`);
  }

  const { watchSources } = repos();
  const before = await watchSources.listingsForContent(contentKey);
  const oldAuthoritativeIds = before
    .filter(
      ({ listing }) => listing.provider === identity.provider,
    )
    .map(({ listing }) => listing.id);

  if (fetched.links.length === 0) {
    // A successful response containing no links is a real result. Remember it
    // briefly so an empty title is not fetched again on every page view.
    emptyRefreshUntil.set(
      refreshCacheKey(contentKey, identity.provider),
      Date.now() + EMPTY_REFRESH_TTL_MS,
    );
    if (fetched.failed === 0) await watchSources.markUnavailable(oldAuthoritativeIds);
    return;
  }

  emptyRefreshUntil.delete(refreshCacheKey(contentKey, identity.provider));
  const touchedIds = new Set<string>();
  let complete = fetched.failed === 0;

  for (const link of fetched.links) {
    const homepageUrl = canonicalizeExternalUrl(link.url);
    const domain = homepageUrl ? normalizeDomain(homepageUrl) : null;
    // A provider can return a malformed or non-http URL. Skip it rather than
    // letting it into the registry, and keep old availability until a clean
    // refresh succeeds.
    if (!homepageUrl || !domain) {
      complete = false;
      continue;
    }

    try {
      const existing = await watchSources.findSourceByDomain(domain);
      const providerSource = {
        name: link.sourceName,
        homepageUrl,
        sourceType: link.sourceType,
        accessType: 'UNKNOWN' as const,
        supportsAnime: link.supportsAnime,
        supportsMovies: link.supportsMovies,
        supportsTv: link.supportsTv,
        regionInfo: link.regionInfo ?? null,
        origin: 'OFFICIAL_API' as const,
        // Data from a provider API is trusted enough to display immediately;
        // community imports remain unverified and disabled until reviewed.
        isVerified: true,
        isEnabled: true,
      };
      // Refresh provider-owned registry metadata (for example old TMDB rows
      // that were previously named after the first service in the chooser),
      // but never overwrite a manually curated source on the same domain.
      const source =
        !existing || existing.origin === 'OFFICIAL_API'
          ? await watchSources.registerSource(providerSource)
          : existing;

      const listing = await watchSources.upsertAvailability({
        watchSourceId: source.id,
        contentKey,
        mediaType: identity.mediaType,
        provider: identity.provider,
        providerMediaId: identity.providerMediaId,
        canonicalMediaKey,
        availabilityUrl: link.url,
        accessType: link.accessType,
        quality: link.quality ?? 'UNKNOWN',
        audio: link.audio ?? 'UNKNOWN',
        priceLabel: link.priceLabel ?? null,
        availabilityStatus: 'AVAILABLE',
        metadata: link.metadata ?? null,
      });
      touchedIds.add(listing.id);
    } catch (error) {
      complete = false;
      // One bad source must not abort the rest of the refresh.
      log.warn('watch_source_upsert_failed', {
        domain,
        message: (error as Error)?.message,
      });
    }
  }

  // Only a fully successful authoritative refresh may retire links that
  // disappeared. Manual/community availability is never touched here.
  if (complete) {
    await watchSources.markUnavailable(
      oldAuthoritativeIds.filter((id) => !touchedIds.has(id)),
    );
  }
}

/**
 * Asks the providers that actually know about this title. Anime uses whichever
 * provider the identity came from; Movies and TV use TMDB.
 */
interface ProviderFetchResult {
  links: ProviderWatchLink[];
  attempted: number;
  failed: number;
}

async function fetchProviderLinks(identity: MediaIdentity): Promise<ProviderFetchResult> {
  const settings = config();
  const timeoutMs = settings.PROVIDER_TIMEOUT_MS;

  const calls: Array<() => Promise<ProviderWatchLink[]>> = [];

  if (identity.mediaType === MediaType.ANIME) {
    if (identity.provider === MediaProvider.ANILIST) {
      const client = new AniListClient({ apiUrl: settings.ANILIST_API_URL, timeoutMs });
      calls.push(() => client.streamingLinks(identity.providerMediaId));
    } else if (identity.provider === MediaProvider.JIKAN) {
      const client = new JikanClient({ baseUrl: settings.JIKAN_API_BASE_URL, timeoutMs });
      calls.push(() => client.streamingLinks(identity.providerMediaId));
    } else if (identity.provider === MediaProvider.KITSU) {
      const client = new KitsuClient({ baseUrl: settings.KITSU_API_BASE_URL, timeoutMs });
      calls.push(() => client.streamingLinks(identity.providerMediaId));
    }
  } else {
    const client = new TmdbClient({
      apiKey: settings.TMDB_API_KEY,
      baseUrl: settings.TMDB_API_BASE_URL,
      timeoutMs,
    });
    calls.push(() => client.watchProviders(identity.providerMediaId, identity.mediaType));
  }

  const bounded = calls.slice(0, MAX_REFRESH_CALLS);
  const settled = await Promise.allSettled(bounded.map((call) => call()));

  const links: ProviderWatchLink[] = [];
  let failed = 0;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      links.push(...result.value);
    } else {
      failed += 1;
      log.warn('watch_provider_failed', {
        provider: identity.provider,
        message: (result.reason as Error)?.message,
      });
    }
  }
  return { links, attempted: bounded.length, failed };
}

function refreshCacheKey(contentKey: string, provider: MediaIdentity['provider']): string {
  return `${contentKey}:${provider}`;
}

function hasFreshEmptyRefresh(
  contentKey: string,
  provider: MediaIdentity['provider'],
): boolean {
  const key = refreshCacheKey(contentKey, provider);
  const until = emptyRefreshUntil.get(key);
  if (!until) return false;
  if (until <= Date.now()) {
    emptyRefreshUntil.delete(key);
    return false;
  }
  return true;
}

function providerOptionsFromMetadata(
  metadata: unknown,
): WatchOption['providerOptions'] | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as { providerOptions?: unknown }).providerOptions;
  if (!Array.isArray(raw)) return undefined;

  const allowedAccess = new Set<string>(Object.values(WatchAccessType));
  const options = raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as { name?: unknown; accessTypes?: unknown };
    if (typeof candidate.name !== 'string' || !Array.isArray(candidate.accessTypes)) return [];
    const accessTypes = candidate.accessTypes.filter(
      (value): value is (typeof WatchAccessType)[keyof typeof WatchAccessType] =>
        typeof value === 'string' && allowedAccess.has(value),
    );
    return accessTypes.length > 0 ? [{ name: candidate.name, accessTypes }] : [];
  });
  return options.length > 0 ? options : undefined;
}

/**
 * Community submission entry point.
 *
 * Deliberately writes to the candidate table, never to the live registry: a
 * submission is a suggestion for review, not a published source.
 */
export async function submitSourceCandidate(input: {
  homepageUrl: string;
  suggestedName?: string | null;
  userId?: string | null;
  guildId?: string | null;
  supportsAnime?: boolean;
  supportsMovies?: boolean;
  supportsTv?: boolean;
  comment?: string | null;
  contentKey?: string | null;
  mediaType?: 'ANIME' | 'MOVIE' | 'TV' | null;
  mediaTitle?: string | null;
  availabilityUrl?: string | null;
}): Promise<{ accepted: boolean }> {
  const { watchSources } = repos();
  const homepageUrl = canonicalizeExternalUrl(input.homepageUrl);
  const availabilityUrl = canonicalizeExternalUrl(input.availabilityUrl ?? input.homepageUrl);
  if (!homepageUrl || !availabilityUrl) {
    throw AppError.validation('Enter a valid public http(s) website URL.');
  }
  const domain = normalizeDomain(homepageUrl);
  const candidate = await watchSources.recordCandidate({
    homepageUrl,
    suggestedName: (input.suggestedName?.trim() || domain || 'Suggested source').slice(0, 120),
    origin: 'COMMUNITY',
    submittedByUserId: input.userId,
    guildId: input.guildId ?? null,
    supportsAnime: input.supportsAnime,
    supportsMovies: input.supportsMovies,
    supportsTv: input.supportsTv,
    comment: input.comment,
    contentKey: input.contentKey,
    mediaType: input.mediaType,
    mediaTitle: input.mediaTitle,
    availabilityUrl,
  });
  return { accepted: candidate !== null };
}

export { WatchAccessType, WatchSourceType };
