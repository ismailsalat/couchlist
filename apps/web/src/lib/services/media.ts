import "server-only";
import {
  AniListClient,
  JikanClient,
  KitsuClient,
  AppError,
  MediaProvider,
  MediaType,
  TmdbClient,
  createLogger,
  type MediaDetail,
  type MediaSummary,
  type SearchResult,
} from "@couchlist/shared";
import { config } from "../config";
import { repos } from "../db";

/**
 * Media lookup across AniList + Jikan + Kitsu (Anime) and TMDB (Movies/TV).
 * Anime providers are isolated behind an ordered fallback chain: one provider
 * outage must never blank the Anime tab or search results.
 *
 * One provider failing must never break unrelated media. Browse data is kept in
 * tiny in-process caches so Couchlist stays simple and does not need a worker,
 * queue, or extra database table just to show starter shelves.
 */
const log = createLogger({ service: "web" });

function clients(timeoutMs?: number) {
  const settings = config();
  const providerTimeout = timeoutMs ?? settings.PROVIDER_TIMEOUT_MS;
  return {
    anilist: new AniListClient({
      apiUrl: settings.ANILIST_API_URL,
      timeoutMs: providerTimeout,
    }),
    jikan: new JikanClient({
      baseUrl: settings.JIKAN_API_BASE_URL,
      timeoutMs: providerTimeout,
    }),
    kitsu: new KitsuClient({
      baseUrl: settings.KITSU_API_BASE_URL,
      timeoutMs: providerTimeout,
    }),
    tmdb: new TmdbClient({
      apiKey: settings.TMDB_API_KEY,
      baseUrl: settings.TMDB_API_BASE_URL,
      timeoutMs: providerTimeout,
    }),
  };
}

export type SearchFilter = "all" | "anime" | "movie" | "tv";

export type BrowseFilter = Exclude<SearchFilter, "all">;
export type BrowseSort = "trending" | "popular" | "top-rated";
export type AnimeBrowseKind = "all" | "series" | "movies";

export const BROWSE_PAGE_SIZE = 20;
export const MAX_BROWSE_PAGES = 25; // 20 × 25 = up to 500 visible picks per ranking.

export interface BrowsePage {
  items: MediaSummary[];
  page: number;
  hasMore: boolean;
  degraded: boolean;
}

export interface GlobalTrending {
  anime: MediaSummary[];
  moviesAndTv: MediaSummary[];
  degraded: boolean;
}

export interface BrowseCatalog {
  animeTrending: MediaSummary[];
  animePopular: MediaSummary[];
  movieTrending: MediaSummary[];
  movieTopRated: MediaSummary[];
  tvTrending: MediaSummary[];
  tvPopular: MediaSummary[];
  degraded: boolean;
}

const DISCOVERY_CACHE_MS = 10 * 60 * 1000;
let trendingCache: { expiresAt: number; value: GlobalTrending } | null = null;
let browseCache: { expiresAt: number; value: BrowseCatalog } | null = null;
const browsePageCache = new Map<
  string,
  { expiresAt: number; value: BrowsePage }
>();

type AnimeProviderName = "anilist" | "jikan" | "kitsu";

interface AnimeFallback<T> {
  value: T;
  provider: AnimeProviderName | null;
  failedProviders: AnimeProviderName[];
  degraded: boolean;
}

interface AnimeBrowseFallbackValue {
  items: MediaSummary[];
  hasMore: boolean;
}

// A failed provider is skipped briefly instead of being hammered on every
// search keystroke or Retry click. The other Anime providers remain available.
const animeProviderCooldownUntil = new Map<AnimeProviderName, number>();
const ANIME_PROVIDER_COOLDOWN_MS = 30_000;
const ANIME_RATE_LIMIT_COOLDOWN_MS = 60_000;

function animeClients() {
  return clients(Math.min(config().PROVIDER_TIMEOUT_MS, 3500));
}

function animeBrowseOrder(sort: BrowseSort): AnimeProviderName[] {
  return sort === "trending"
    ? ["anilist", "jikan", "kitsu"]
    : ["jikan", "anilist", "kitsu"];
}

async function searchAnimeWithFallback(
  query: string,
  limit: number,
): Promise<AnimeFallback<MediaSummary[]>> {
  const providerClients = animeClients();
  const failedProviders: AnimeProviderName[] = [];
  for (const provider of ["anilist", "jikan", "kitsu"] as const) {
    if (animeProviderCoolingDown(provider)) {
      failedProviders.push(provider);
      continue;
    }

    try {
      const value =
        provider === "anilist"
          ? await providerClients.anilist.search(query, limit)
          : provider === "jikan"
            ? await providerClients.jikan.search(query, limit)
            : await providerClients.kitsu.search(query, limit);

      animeProviderCooldownUntil.delete(provider);
      if (value.length > 0) {
        return {
          value,
          provider,
          failedProviders,
          degraded: failedProviders.length > 0,
        };
      }
    } catch (error) {
      failedProviders.push(provider);
      coolDownAnimeProvider(provider, error);
      log.warn("provider_search_failed", {
        provider,
        ...providerFailureMeta(error),
      });
    }
  }

  return {
    value: [],
    provider: null,
    failedProviders,
    degraded: failedProviders.length > 0,
  };
}

async function browseAnimeWithFallback(
  sort: BrowseSort,
  page: number,
  limit: number,
  kind: AnimeBrowseKind,
): Promise<AnimeFallback<AnimeBrowseFallbackValue>> {
  const providerClients = animeClients();
  const failedProviders: AnimeProviderName[] = [];
  for (const provider of animeBrowseOrder(sort)) {
    if (animeProviderCoolingDown(provider)) {
      failedProviders.push(provider);
      continue;
    }

    try {
      let items: MediaSummary[];
      let hasMore: boolean;

      if (provider === "anilist") {
        items = await providerClients.anilist.browsePage(sort, page, limit, kind);
        hasMore = items.length >= limit;
      } else if (provider === "jikan") {
        const result = await providerClients.jikan.browsePage(sort, page, limit, kind);
        items = result.items;
        hasMore = result.hasMore;
      } else {
        const result = await providerClients.kitsu.browsePage(sort, page, limit, kind);
        items = result.items;
        hasMore = result.hasMore;
      }

      animeProviderCooldownUntil.delete(provider);
      if (items.length > 0) {
        return {
          value: { items, hasMore },
          provider,
          failedProviders,
          degraded: failedProviders.length > 0,
        };
      }
    } catch (error) {
      failedProviders.push(provider);
      coolDownAnimeProvider(provider, error);
      log.warn("provider_browse_failed", {
        provider,
        sort,
        animeKind: kind,
        page,
        ...providerFailureMeta(error),
      });
    }
  }

  return {
    value: { items: [], hasMore: false },
    provider: null,
    failedProviders,
    degraded: failedProviders.length > 0,
  };
}

function animeProviderCoolingDown(provider: AnimeProviderName): boolean {
  const until = animeProviderCooldownUntil.get(provider) ?? 0;
  if (until <= Date.now()) {
    animeProviderCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

function coolDownAnimeProvider(provider: AnimeProviderName, error: unknown): void {
  const meta = providerFailureMeta(error);
  const status = typeof meta.providerStatus === "number" ? meta.providerStatus : null;
  const duration =
    status === 403 || status === 429
      ? ANIME_RATE_LIMIT_COOLDOWN_MS
      : ANIME_PROVIDER_COOLDOWN_MS;
  animeProviderCooldownUntil.set(provider, Date.now() + duration);
}

export async function searchMedia(
  query: string,
  filter: SearchFilter = "all",
): Promise<SearchResult> {
  const { tmdb } = clients();
  const failed: string[] = [];

  const wantAnime = filter === "all" || filter === "anime";
  const wantTmdb = filter === "all" || filter === "movie" || filter === "tv";

  const [animeResult, tmdbResult] = await Promise.allSettled([
    wantAnime
      ? searchAnimeWithFallback(query, 8)
      : Promise.resolve<AnimeFallback<MediaSummary[]>>({
          value: [],
          provider: null,
          failedProviders: [],
          degraded: false,
        }),
    wantTmdb ? tmdb.search(query, 8) : Promise.resolve([]),
  ]);

  const results: MediaSummary[] = [];

  if (animeResult.status === "fulfilled") {
    results.push(...animeResult.value.value);
    failed.push(...animeResult.value.failedProviders);
  } else {
    failed.push("anilist", "jikan", "kitsu");
    log.warn("anime_search_chain_failed", {
      reason: reason(animeResult),
    });
  }

  if (tmdbResult.status === "fulfilled") {
    const filtered =
      filter === "movie"
        ? tmdbResult.value.filter((item) => item.mediaType === MediaType.MOVIE)
        : filter === "tv"
          ? tmdbResult.value.filter((item) => item.mediaType === MediaType.TV)
          : tmdbResult.value;
    results.push(...filtered);
  } else {
    failed.push("tmdb");
    log.warn("provider_search_failed", {
      provider: "tmdb",
      reason: reason(tmdbResult),
    });
  }

  return {
    results: interleave(results),
    degraded: failed.length > 0,
    failedProviders: [...new Set(failed)],
  };
}

/**
 * Small global discovery shelf for Home. Stale successful data is preferred to
 * an empty shelf when an upstream provider has a temporary bad minute.
 */
export async function getGlobalTrending(limit = 6): Promise<GlobalTrending> {
  const now = Date.now();
  if (trendingCache && trendingCache.expiresAt > now)
    return trendingCache.value;

  const stale = trendingCache?.value;
  const { tmdb } = clients(Math.min(config().PROVIDER_TIMEOUT_MS, 3000));
  const [animeResult, tmdbResult] = await Promise.allSettled([
    browseAnimeWithFallback("trending", 1, limit, "all"),
    tmdb.trending(limit),
  ]);

  const anime =
    animeResult.status === "fulfilled" && animeResult.value.value.items.length > 0
      ? animeResult.value.value.items
      : (stale?.anime ?? []);
  const animeDegraded =
    animeResult.status === "rejected" ||
    (animeResult.status === "fulfilled" && animeResult.value.degraded);

  const value: GlobalTrending = {
    anime,
    moviesAndTv:
      tmdbResult.status === "fulfilled"
        ? tmdbResult.value
        : (stale?.moviesAndTv ?? []),
    degraded: animeDegraded || tmdbResult.status === "rejected",
  };

  if (animeResult.status === "rejected") {
    log.warn("anime_trending_chain_failed", {
      reason: reason(animeResult),
    });
  }
  if (tmdbResult.status === "rejected") {
    log.warn("provider_trending_failed", {
      provider: "tmdb",
      reason: reason(tmdbResult),
    });
  }

  const cacheMs = value.degraded ? 15_000 : DISCOVERY_CACHE_MS;
  trendingCache = { expiresAt: now + cacheMs, value };
  return value;
}

/**
 * Fuller starter catalog for /search. It is still discovery, not a local media
 * database: the search box remains the full catalog. Category-specific provider
 * calls ensure Movies and TV do not compete for six slots in one mixed feed.
 */
export async function getBrowseCatalog(limit = 10): Promise<BrowseCatalog> {
  const now = Date.now();
  if (browseCache && browseCache.expiresAt > now) return browseCache.value;

  const stale = browseCache?.value;
  const { tmdb } = clients(Math.min(config().PROVIDER_TIMEOUT_MS, 4500));

  const [
    animeTrendingResult,
    animePopularResult,
    movieNowResult,
    movieTopResult,
    tvNowResult,
    tvPopularResult,
  ] = await Promise.allSettled([
    browseAnimeWithFallback("trending", 1, limit, "all"),
    browseAnimeWithFallback("popular", 1, limit, "all"),
    tmdb.trendingMovies(limit),
    tmdb.topRatedMovies(limit),
    tmdb.trendingTv(limit),
    tmdb.popularTv(limit),
  ]);

  const animeTrending =
    animeTrendingResult.status === "fulfilled" &&
    animeTrendingResult.value.value.items.length > 0
      ? animeTrendingResult.value.value.items
      : (stale?.animeTrending ?? []);
  const animePopular =
    animePopularResult.status === "fulfilled" &&
    animePopularResult.value.value.items.length > 0
      ? animePopularResult.value.value.items
      : (stale?.animePopular ?? []);

  const animeTrendingDegraded =
    animeTrendingResult.status === "rejected" ||
    (animeTrendingResult.status === "fulfilled" && animeTrendingResult.value.degraded);
  const animePopularDegraded =
    animePopularResult.status === "rejected" ||
    (animePopularResult.status === "fulfilled" && animePopularResult.value.degraded);

  const value: BrowseCatalog = {
    animeTrending,
    animePopular,
    movieTrending:
      movieNowResult.status === "fulfilled"
        ? movieNowResult.value
        : (stale?.movieTrending ?? []),
    movieTopRated:
      movieTopResult.status === "fulfilled"
        ? movieTopResult.value
        : (stale?.movieTopRated ?? []),
    tvTrending:
      tvNowResult.status === "fulfilled"
        ? tvNowResult.value
        : (stale?.tvTrending ?? []),
    tvPopular:
      tvPopularResult.status === "fulfilled"
        ? tvPopularResult.value
        : (stale?.tvPopular ?? []),
    degraded:
      animeTrendingDegraded ||
      animePopularDegraded ||
      movieNowResult.status === "rejected" ||
      movieTopResult.status === "rejected" ||
      tvNowResult.status === "rejected" ||
      tvPopularResult.status === "rejected",
  };

  if (animeTrendingResult.status === "rejected") {
    log.warn("anime_browse_chain_failed", { section: "trending" });
  }
  if (animePopularResult.status === "rejected") {
    log.warn("anime_browse_chain_failed", { section: "popular" });
  }
  logBrowseFailure("tmdb_movie_trending", movieNowResult);
  logBrowseFailure("tmdb_movie_top_rated", movieTopResult);
  logBrowseFailure("tmdb_tv_trending", tvNowResult);
  logBrowseFailure("tmdb_tv_popular", tvPopularResult);

  const cacheMs = value.degraded ? 15_000 : DISCOVERY_CACHE_MS;
  browseCache = { expiresAt: now + cacheMs, value };
  return value;
}

/**
 * Long-form browse page for a single media category/ranking.
 *
 * The browser loads 20 at a time and appends them. There is no local catalog
 * database, sync worker, or infinite-scroll dependency: every page comes
 * directly from Anime providers/TMDB and is cached in memory for a few minutes.
 */
export async function getBrowsePage(
  filter: BrowseFilter,
  sort: BrowseSort,
  page = 1,
  animeKind: AnimeBrowseKind = "all",
): Promise<BrowsePage> {
  const safePage = Math.min(
    MAX_BROWSE_PAGES,
    Math.max(1, Math.floor(page)),
  );
  const safeAnimeKind = filter === "anime" ? animeKind : "all";
  const key = `${filter}:${safeAnimeKind}:${sort}:${safePage}`;
  const now = Date.now();
  const cached = browsePageCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const stale = cached?.value;

  if (filter === "anime") {
    const result = await browseAnimeWithFallback(
      sort,
      safePage,
      BROWSE_PAGE_SIZE,
      safeAnimeKind,
    );

    if (result.value.items.length > 0) {
      const value: BrowsePage = {
        items: result.value.items,
        page: safePage,
        hasMore: result.value.hasMore && safePage < MAX_BROWSE_PAGES,
        degraded: result.degraded,
      };
      browsePageCache.set(key, {
        expiresAt: now + (value.degraded ? 15_000 : DISCOVERY_CACHE_MS),
        value,
      });
      return value;
    }

    if (result.degraded) {
      log.warn("provider_browse_page_failed", {
        filter,
        sort,
        animeKind: safeAnimeKind,
        page: safePage,
        failedProviders: result.failedProviders.join(","),
      });

      if (stale) return { ...stale, degraded: true };
      const fallback =
        safePage === 1
          ? firstPageBrowseFallback(filter, sort, safeAnimeKind)
          : [];
      return {
        items: fallback,
        page: safePage,
        hasMore: fallback.length > 0 && safePage < MAX_BROWSE_PAGES,
        degraded: true,
      };
    }

    return {
      items: [],
      page: safePage,
      hasMore: false,
      degraded: false,
    };
  }

  try {
    const { tmdb } = clients(Math.min(config().PROVIDER_TIMEOUT_MS, 4500));
    const items =
      filter === "movie"
        ? sort === "trending"
          ? await tmdb.trendingMovies(BROWSE_PAGE_SIZE, safePage)
          : sort === "popular"
            ? await tmdb.popularMovies(BROWSE_PAGE_SIZE, safePage)
            : await tmdb.topRatedMovies(BROWSE_PAGE_SIZE, safePage)
        : sort === "trending"
          ? await tmdb.trendingTv(BROWSE_PAGE_SIZE, safePage)
          : sort === "popular"
            ? await tmdb.popularTv(BROWSE_PAGE_SIZE, safePage)
            : await tmdb.topRatedTv(BROWSE_PAGE_SIZE, safePage);

    const value: BrowsePage = {
      items,
      page: safePage,
      hasMore: items.length === BROWSE_PAGE_SIZE && safePage < MAX_BROWSE_PAGES,
      degraded: false,
    };
    browsePageCache.set(key, {
      expiresAt: now + DISCOVERY_CACHE_MS,
      value,
    });
    return value;
  } catch (error) {
    const failure = providerFailureMeta(error);
    log.warn("provider_browse_page_failed", {
      filter,
      sort,
      animeKind: safeAnimeKind,
      page: safePage,
      ...failure,
    });

    if (stale) return { ...stale, degraded: true };

    const fallback =
      safePage === 1
        ? firstPageBrowseFallback(filter, sort, safeAnimeKind)
        : [];
    return {
      items: fallback,
      page: safePage,
      hasMore: fallback.length > 0 && safePage < MAX_BROWSE_PAGES,
      degraded: true,
    };
  }
}

function firstPageBrowseFallback(
  filter: BrowseFilter,
  sort: BrowseSort,
  animeKind: AnimeBrowseKind,
): MediaSummary[] {
  if (filter === "anime" && animeKind === "all") {
    if (sort === "trending") {
      const browseAnime = browseCache?.value.animeTrending ?? [];
      if (browseAnime.length > 0) return browseAnime;
      return trendingCache?.value.anime ?? [];
    }
    if (sort === "popular") return browseCache?.value.animePopular ?? [];
    return [];
  }

  if (filter === "movie") {
    if (sort === "trending") return browseCache?.value.movieTrending ?? [];
    if (sort === "top-rated") return browseCache?.value.movieTopRated ?? [];
    return [];
  }

  if (filter === "tv") {
    if (sort === "trending") return browseCache?.value.tvTrending ?? [];
    if (sort === "popular") return browseCache?.value.tvPopular ?? [];
  }

  return [];
}

/** Title detail, served from cache when fresh. */
export async function getMediaDetail(
  provider: MediaProvider,
  mediaType: MediaType,
  providerMediaId: string,
): Promise<MediaDetail> {
  const identity = { provider, providerMediaId, mediaType };
  const { cache } = repos();

  const cached = await cache.get<MediaDetail>(identity);
  if (cached) return cached;

  const { anilist, jikan, kitsu, tmdb } = clients();

  const detail =
    provider === MediaProvider.ANILIST
      ? await anilist.byId(providerMediaId)
      : provider === MediaProvider.JIKAN
        ? await jikan.byId(providerMediaId)
        : provider === MediaProvider.KITSU
          ? await kitsu.byId(providerMediaId)
          : await tmdb.byId(providerMediaId, mediaType);

  if (!detail) throw AppError.notFound("title");

  await cache.set(
    identity,
    {
      title: detail.title,
      year: detail.year,
      posterUrl: detail.posterUrl,
      bannerUrl: detail.bannerUrl,
    },
    detail,
    config().MEDIA_CACHE_TTL_HOURS,
  );

  return detail;
}

/** Health probe used by /api/health. Never throws. */
export async function providerHealth(): Promise<{
  anilist: "healthy" | "degraded";
  jikan: "healthy" | "degraded";
  kitsu: "healthy" | "degraded";
  tmdb: "healthy" | "degraded" | "not_configured";
}> {
  const { anilist, jikan, kitsu, tmdb } = animeClients();

  const [anilistCheck, jikanCheck, kitsuCheck, tmdbCheck] = await Promise.allSettled([
    anilist.browsePage("trending", 1, 1, "all"),
    jikan.browsePage("popular", 1, 1, "all"),
    kitsu.browsePage("popular", 1, 1, "all"),
    tmdb.configured
      ? tmdb.search("a", 1)
      : Promise.reject(new Error("not configured")),
  ]);

  return {
    anilist: anilistCheck.status === "fulfilled" ? "healthy" : "degraded",
    jikan: jikanCheck.status === "fulfilled" ? "healthy" : "degraded",
    kitsu: kitsuCheck.status === "fulfilled" ? "healthy" : "degraded",
    tmdb: !tmdb.configured
      ? "not_configured"
      : tmdbCheck.status === "fulfilled"
        ? "healthy"
        : "degraded",
  };
}

function providerFailureMeta(error: unknown): Record<string, string | number> {
  if (!(error instanceof AppError)) {
    return { reason: (error as Error)?.name ?? "unknown" };
  }

  const output: Record<string, string | number> = { reason: error.code };
  const status = error.context.status ?? error.context.providerStatus;
  const retryAfterSeconds = error.context.retryAfterSeconds;
  const rateLimitRemaining = error.context.rateLimitRemaining;

  if (typeof status === "number") output.providerStatus = status;
  if (typeof retryAfterSeconds === "number") {
    output.retryAfterSeconds = retryAfterSeconds;
  }
  if (typeof rateLimitRemaining === "number") {
    output.rateLimitRemaining = rateLimitRemaining;
  }
  return output;
}

function interleave(results: MediaSummary[]): MediaSummary[] {
  const anime = results.filter(
    (item) => item.mediaType === MediaType.ANIME,
  );
  const other = results.filter(
    (item) => item.mediaType !== MediaType.ANIME,
  );
  const merged: MediaSummary[] = [];

  for (
    let index = 0;
    index < Math.max(anime.length, other.length);
    index += 1
  ) {
    const a = anime[index];
    const b = other[index];
    if (a) merged.push(a);
    if (b) merged.push(b);
  }
  return merged;
}

function logBrowseFailure(
  section: string,
  result: PromiseSettledResult<unknown>,
): void {
  if (result.status !== "rejected") return;
  log.warn("provider_browse_failed", {
    section,
    ...providerFailureMeta(result.reason),
  });
}

function reason(result: PromiseRejectedResult): string {
  const error = result.reason;
  return error instanceof AppError
    ? error.code
    : ((error as Error)?.name ?? "unknown");
}
