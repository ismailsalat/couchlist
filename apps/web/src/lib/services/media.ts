import 'server-only';
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
} from '@couchlist/shared';
import { config } from '../config';
import { repos } from '../db';

/**
 * Media lookup across AniList and TMDB.
 *
 * Two behaviours matter here:
 *  1. One provider failing must not break the page. Search returns whatever
 *     succeeded and flags itself as degraded.
 *  2. Results are cached, so a user refreshing repeatedly does not hammer an
 *     upstream API.
 */
const log = createLogger({ service: 'web' });

function clients() {
  const settings = config();
  return {
    anilist: new AniListClient({
      apiUrl: settings.ANILIST_API_URL,
      timeoutMs: settings.PROVIDER_TIMEOUT_MS,
    }),
    tmdb: new TmdbClient({
      apiKey: settings.TMDB_API_KEY,
      baseUrl: settings.TMDB_API_BASE_URL,
      timeoutMs: settings.PROVIDER_TIMEOUT_MS,
    }),
  };
}

export type SearchFilter = 'all' | 'anime' | 'movie' | 'tv';

export async function searchMedia(query: string, filter: SearchFilter = 'all'): Promise<SearchResult> {
  const { anilist, tmdb } = clients();
  const failed: string[] = [];

  const wantAnime = filter === 'all' || filter === 'anime';
  const wantTmdb = filter === 'all' || filter === 'movie' || filter === 'tv';

  // Both providers are queried in parallel and settled independently, so a
  // slow or broken one cannot take the other down with it.
  const [animeResult, tmdbResult] = await Promise.allSettled([
    wantAnime ? anilist.search(query, 8) : Promise.resolve([]),
    wantTmdb ? tmdb.search(query, 8) : Promise.resolve([]),
  ]);

  const results: MediaSummary[] = [];

  if (animeResult.status === 'fulfilled') {
    results.push(...animeResult.value);
  } else {
    failed.push('anilist');
    log.warn('provider_search_failed', { provider: 'anilist', reason: reason(animeResult) });
  }

  if (tmdbResult.status === 'fulfilled') {
    const filtered =
      filter === 'movie'
        ? tmdbResult.value.filter((item) => item.mediaType === MediaType.MOVIE)
        : filter === 'tv'
          ? tmdbResult.value.filter((item) => item.mediaType === MediaType.TV)
          : tmdbResult.value;
    results.push(...filtered);
  } else {
    failed.push('tmdb');
    log.warn('provider_search_failed', { provider: 'tmdb', reason: reason(tmdbResult) });
  }

  // Interleave so neither provider dominates the top of the list.
  return {
    results: interleave(results),
    degraded: failed.length > 0,
    failedProviders: failed,
  };
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

  if (!detail) throw AppError.notFound('title');

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
  anilist: 'healthy' | 'degraded';
  tmdb: 'healthy' | 'degraded' | 'not_configured';
}> {
  const { anilist, tmdb } = clients();

  const [animeCheck, tmdbCheck] = await Promise.allSettled([
    anilist.search('a', 1),
    tmdb.configured ? tmdb.search('a', 1) : Promise.reject(new Error('not configured')),
  ]);

  return {
    anilist: animeCheck.status === 'fulfilled' ? 'healthy' : 'degraded',
    tmdb: !tmdb.configured
      ? 'not_configured'
      : tmdbCheck.status === 'fulfilled'
        ? 'healthy'
        : 'degraded',
  };
}

function interleave(results: MediaSummary[]): MediaSummary[] {
  const anime = results.filter((item) => item.provider === MediaProvider.ANILIST);
  const other = results.filter((item) => item.provider !== MediaProvider.ANILIST);
  const merged: MediaSummary[] = [];

  for (let index = 0; index < Math.max(anime.length, other.length); index += 1) {
    const a = anime[index];
    const b = other[index];
    if (a) merged.push(a);
    if (b) merged.push(b);
  }
  return merged;
}

function reason(result: PromiseRejectedResult): string {
  const error = result.reason;
  return error instanceof AppError ? error.code : ((error as Error)?.name ?? 'unknown');
}
