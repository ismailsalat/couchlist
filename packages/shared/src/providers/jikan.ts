import {
  MediaProvider,
  MediaType,
  canonicalAnimeKeyFromMalId,
} from '../media/identity.js';
import type { MediaDetail, MediaSummary } from '../media/types.js';
import type { ProviderWatchLink } from '../watch/provider-link.js';
import { WatchAccessType, WatchSourceType } from '../watch/types.js';
import { fetchJson } from './http.js';

/**
 * Jikan adapter (anime only).
 *
 * Jikan exposes public MyAnimeList catalog data over a simple REST API and does
 * not require an API key. Couchlist uses it as the primary Anime catalog so a
 * temporary AniList API suspension cannot blank the Anime tab for everybody.
 */

export type JikanBrowseSort = 'trending' | 'popular' | 'top-rated';
export type JikanBrowseFormat = 'all' | 'series' | 'movies';

export interface JikanClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

interface JikanImageSet {
  jpg?: {
    image_url?: string | null;
    large_image_url?: string | null;
  } | null;
  webp?: {
    image_url?: string | null;
    large_image_url?: string | null;
  } | null;
}

interface JikanNamedItem {
  name?: string | null;
}

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  year?: number | null;
  aired?: { prop?: { from?: { year?: number | null } | null } | null } | null;
  episodes?: number | null;
  type?: string | null;
  status?: string | null;
  synopsis?: string | null;
  source?: string | null;
  images?: JikanImageSet | null;
  trailer?: { images?: { maximum_image_url?: string | null; large_image_url?: string | null } | null } | null;
  genres?: JikanNamedItem[] | null;
  studios?: JikanNamedItem[] | null;
}

interface JikanPageResponse {
  data?: JikanAnime[];
  pagination?: {
    has_next_page?: boolean;
  };
}

interface JikanDetailResponse {
  data?: JikanAnime | null;
}

export interface JikanBrowsePage {
  items: MediaSummary[];
  hasMore: boolean;
}

export class JikanClient {
  constructor(private readonly options: JikanClientOptions) {}

  async search(query: string, limit = 10): Promise<MediaSummary[]> {
    const url = this.url('/anime', {
      q: query,
      limit: String(Math.min(Math.max(1, limit), 25)),
      sfw: 'true',
    });
    const payload = await fetchJson<JikanPageResponse>(url, {
      providerName: 'jikan',
      timeoutMs: this.options.timeoutMs,
      retries: 0,
    });
    return (payload.data ?? []).map(toSummary);
  }

  async trending(limit = 8): Promise<MediaSummary[]> {
    const page = await this.browsePage('trending', 1, limit, 'all');
    return page.items;
  }

  async browse(limit = 10): Promise<{ trending: MediaSummary[]; popular: MediaSummary[] }> {
    const [trending, popular] = await Promise.all([
      this.browsePage('trending', 1, limit, 'all'),
      this.browsePage('popular', 1, limit, 'all'),
    ]);
    return { trending: trending.items, popular: popular.items };
  }

  async browsePage(
    sort: JikanBrowseSort,
    page = 1,
    limit = 20,
    format: JikanBrowseFormat = 'all',
  ): Promise<JikanBrowsePage> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, limit), 25);
    const params: Record<string, string> = {
      page: String(safePage),
      limit: String(safeLimit),
      sfw: 'true',
    };

    // Jikan's top endpoint gives us stable ranking pages. "Airing" is the
    // closest provider-native equivalent to a live/trending anime shelf.
    if (sort === 'trending') params.filter = format === 'movies' ? 'bypopularity' : 'airing';
    if (sort === 'popular') params.filter = 'bypopularity';

    if (format === 'movies') params.type = 'movie';
    if (format === 'series') params.type = 'tv';

    const payload = await fetchJson<JikanPageResponse>(this.url('/top/anime', params), {
      providerName: 'jikan',
      timeoutMs: this.options.timeoutMs,
      retries: 0,
    });

    return {
      items: (payload.data ?? []).map(toSummary),
      hasMore: Boolean(payload.pagination?.has_next_page),
    };
  }

  async byId(id: string): Promise<MediaDetail | null> {
    const numeric = Number.parseInt(id, 10);
    if (!Number.isFinite(numeric)) return null;

    const payload = await fetchJson<JikanDetailResponse>(
      this.url(`/anime/${numeric}/full`),
      {
        providerName: 'jikan',
        timeoutMs: this.options.timeoutMs,
        retries: 0,
      },
    );
    return payload.data ? toDetail(payload.data) : null;
  }

  /**
   * Streaming platforms MyAnimeList lists for a title.
   *
   * MAL gives a platform name and a URL and nothing else, so access tier and
   * quality both stay unknown here.
   */
  async streamingLinks(id: string): Promise<ProviderWatchLink[]> {
    const numeric = Number.parseInt(id, 10);
    if (!Number.isFinite(numeric)) return [];

    const payload = await fetchJson<JikanStreamingResponse>(
      this.url(`/anime/${numeric}/streaming`),
      { providerName: 'jikan', timeoutMs: this.options.timeoutMs, retries: 0 },
    );

    return (payload.data ?? [])
      .filter(
        (entry): entry is { name: string; url: string } =>
          typeof entry?.name === 'string' && typeof entry.url === 'string',
      )
      .map((entry) => ({
        sourceName: entry.name,
        url: entry.url,
        sourceType: WatchSourceType.OFFICIAL,
        accessType: WatchAccessType.UNKNOWN,
        supportsAnime: true,
        supportsMovies: false,
        supportsTv: false,
      }));
  }

  private url(path: string, params: Record<string, string> = {}): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }
}

interface JikanStreamingResponse {
  data?: Array<{ name?: string | null; url?: string | null } | null>;
}

function toSummary(anime: JikanAnime): MediaSummary {
  return {
    provider: MediaProvider.JIKAN,
    providerMediaId: String(anime.mal_id),
    mediaType: MediaType.ANIME,
    canonicalMediaKey: canonicalAnimeKeyFromMalId(anime.mal_id),
    title: anime.title_english ?? anime.title ?? anime.title_japanese ?? `Anime #${anime.mal_id}`,
    year: anime.year ?? anime.aired?.prop?.from?.year ?? null,
    posterUrl:
      anime.images?.webp?.large_image_url ??
      anime.images?.jpg?.large_image_url ??
      anime.images?.webp?.image_url ??
      anime.images?.jpg?.image_url ??
      null,
    episodeCount: anime.episodes ?? null,
    runtimeMinutes: null,
    seasonCount: null,
  };
}

function toDetail(anime: JikanAnime): MediaDetail {
  const summary = toSummary(anime);
  return {
    ...summary,
    bannerUrl:
      anime.trailer?.images?.maximum_image_url ??
      anime.trailer?.images?.large_image_url ??
      null,
    description: anime.synopsis ?? null,
    genres: (anime.genres ?? []).flatMap((genre) => (genre.name ? [genre.name] : [])),
    status: anime.status ?? null,
    studio: anime.studios?.find((studio) => studio.name)?.name ?? null,
    source: anime.source ?? null,
  };
}
