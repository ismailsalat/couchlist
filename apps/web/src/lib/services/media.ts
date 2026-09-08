import "server-only";
import {
  AniListClient,
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
 * Media lookup across AniList and TMDB.
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

export async function searchMedia(
  query: string,
  filter: SearchFilter = "all",
): Promise<SearchResult> {
  const { anilist, tmdb } = clients();
  const failed: string[] = [];

  const wantAnime = filter === "all" || filter === "anime";
  const wantTmdb = filter === "all" || filter === "movie" || filter === "tv";

  const [animeResult, tmdbResult] = await Promise.allSettled([
    wantAnime ? anilist.search(query, 8) : Promise.resolve([]),
    wantTmdb ? tmdb.search(query, 8) : Promise.resolve([]),
  ]);

  const results: MediaSummary[] = [];

  if (animeResult.status === "fulfilled") {
    results.push(...animeResult.value);
  } else {
    failed.push("anilist");
    log.warn("provider_search_failed", {
      provider: "anilist",
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
    failedProviders: failed,
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
  const { anilist, tmdb } = clients(
    Math.min(config().PROVIDER_TIMEOUT_MS, 3000),
  );
  const [animeResult, tmdbResult] = await Promise.allSettled([
    anilist.trending(limit),
    tmdb.trending(limit),
  ]);

  const value: GlobalTrending = {
    anime:
      animeResult.status === "fulfilled"
        ? animeResult.value
        : (stale?.anime ?? []),
    moviesAndTv:
      tmdbResult.status === "fulfilled"
        ? tmdbResult.value
        : (stale?.moviesAndTv ?? []),
    degraded:
      animeResult.status === "rejected" || tmdbResult.status === "rejected",
  };

  if (animeResult.status === "rejected") {
    log.warn("provider_trending_failed", {
      provider: "anilist",
      reason: reason(animeResult),
    });
  }
  if (tmdbResult.status === "rejected") {
    log.warn("provider_trending_failed", {
      provider: "tmdb",
      reason: reason(tmdbResult),
    });
  }

  const cacheMs = value.degraded ? 60_000 : DISCOVERY_CACHE_MS;
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
  const { anilist, tmdb } = clients(
    Math.min(config().PROVIDER_TIMEOUT_MS, 4500),
  );

  const [animeResult, movieNowResult, movieTopResult, tvNowResult, tvPopularResult] =
    await Promise.allSettled([
      anilist.browse(limit),
      tmdb.trendingMovies(limit),
      tmdb.topRatedMovies(limit),
      tmdb.trendingTv(limit),
      tmdb.popularTv(limit),
    ]);

  const value: BrowseCatalog = {
    animeTrending:
      animeResult.status === "fulfilled"
        ? animeResult.value.trending
        : (stale?.animeTrending ?? []),
    animePopular:
      animeResult.status === "fulfilled"
        ? animeResult.value.popular
        : (stale?.animePopular ?? []),
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
      animeResult.status === "rejected" ||
      movieNowResult.status === "rejected" ||
      movieTopResult.status === "rejected" ||
      tvNowResult.status === "rejected" ||
      tvPopularResult.status === "rejected",
  };

  logBrowseFailure("anilist", animeResult);
  logBrowseFailure("tmdb_movie_trending", movieNowResult);
  logBrowseFailure("tmdb_movie_top_rated", movieTopResult);
  logBrowseFailure("tmdb_tv_trending", tvNowResult);
  logBrowseFailure("tmdb_tv_popular", tvPopularResult);

  const cacheMs = value.degraded ? 60_000 : DISCOVERY_CACHE_MS;
  browseCache = { expiresAt: now + cacheMs, value };
  return value;
}

/**
 * Long-form browse page for a single media category/ranking.
 *
 * The browser loads 20 at a time and appends them. There is no local catalog
 * database, sync worker, or infinite-scroll dependency: every page comes
 * directly from AniList/TMDB and is cached in memory for a few minutes.
 */
export async function getBrowsePage(
  filter: BrowseFilter,
  sort: BrowseSort,
  page = 1,
): Promise<BrowsePage> {
  const safePage = Math.min(
    MAX_BROWSE_PAGES,
    Math.max(1, Math.floor(page)),
  );
  const key = `${filter}:${sort}:${safePage}`;
  const now = Date.now();
  const cached = browsePageCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const stale = cached?.value;
  const { anilist, tmdb } = clients(
    Math.min(config().PROVIDER_TIMEOUT_MS, 4500),
  );

  try {
    let items: MediaSummary[];

    if (filter === "anime") {
      items = await anilist.browsePage(sort, safePage, BROWSE_PAGE_SIZE);
    } else if (filter === "movie") {
      items =
        sort === "trending"
          ? await tmdb.trendingMovies(BROWSE_PAGE_SIZE, safePage)
          : sort === "popular"
            ? await tmdb.popularMovies(BROWSE_PAGE_SIZE, safePage)
            : await tmdb.topRatedMovies(BROWSE_PAGE_SIZE, safePage);
    } else {
      items =
        sort === "trending"
          ? await tmdb.trendingTv(BROWSE_PAGE_SIZE, safePage)
          : sort === "popular"
            ? await tmdb.popularTv(BROWSE_PAGE_SIZE, safePage)
            : await tmdb.topRatedTv(BROWSE_PAGE_SIZE, safePage);
    }

    const value: BrowsePage = {
      items,
      page: safePage,
      hasMore:
        items.length === BROWSE_PAGE_SIZE && safePage < MAX_BROWSE_PAGES,
      degraded: false,
    };
    browsePageCache.set(key, {
      expiresAt: now + DISCOVERY_CACHE_MS,
      value,
    });
    return value;
  } catch (error) {
    log.warn("provider_browse_page_failed", {
      filter,
      sort,
      page: safePage,
      reason: error instanceof AppError ? error.code : ((error as Error)?.name ?? "unknown"),
    });

    if (stale) return { ...stale, degraded: true };
    return { items: [], page: safePage, hasMore: false, degraded: true };
  }
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

  const { anilist, tmdb } = clients();

  const detail =
    provider === MediaProvider.ANILIST
      ? await anilist.byId(providerMediaId)
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
  tmdb: "healthy" | "degraded" | "not_configured";
}> {
  const { anilist, tmdb } = clients();

  const [animeCheck, tmdbCheck] = await Promise.allSettled([
    anilist.search("a", 1),
    tmdb.configured
      ? tmdb.search("a", 1)
      : Promise.reject(new Error("not configured")),
  ]);

  return {
    anilist: animeCheck.status === "fulfilled" ? "healthy" : "degraded",
    tmdb: !tmdb.configured
      ? "not_configured"
      : tmdbCheck.status === "fulfilled"
        ? "healthy"
        : "degraded",
  };
}

function interleave(results: MediaSummary[]): MediaSummary[] {
  const anime = results.filter(
    (item) => item.provider === MediaProvider.ANILIST,
  );
  const other = results.filter(
    (item) => item.provider !== MediaProvider.ANILIST,
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
    reason: reason(result),
  });
}

function reason(result: PromiseRejectedResult): string {
  const error = result.reason;
  return error instanceof AppError
    ? error.code
    : ((error as Error)?.name ?? "unknown");
}
