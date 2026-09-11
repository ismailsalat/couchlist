import { MediaProvider, MediaType } from "../media/identity.js";
import type { MediaDetail, MediaSummary } from "../media/types.js";
import type { ProviderWatchLink } from "../watch/provider-link.js";
import { WatchAccessType, WatchSourceType } from "../watch/types.js";
import { fetchJson } from "./http.js";

/**
 * TMDB adapter (movies and TV).
 *
 * The API key goes in a header when a bearer token is configured. Couchlist
 * keeps category-specific browse helpers here so the UI does not have to fake a
 * catalog by filtering one tiny mixed result set.
 */

const IMAGE_BASE = "https://image.tmdb.org/t/p";

interface TmdbSearchItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  adult?: boolean;
}

interface TmdbDetail extends TmdbSearchItem {
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  status?: string | null;
  genres?: Array<{ id: number; name: string }>;
  production_companies?: Array<{ name: string }>;
}

interface TmdbProviderEntry {
  provider_id?: number;
  provider_name?: string;
}

interface TmdbRegionProviders {
  /** JustWatch deep link for this title and region. */
  link?: string;
  flatrate?: TmdbProviderEntry[];
  free?: TmdbProviderEntry[];
  ads?: TmdbProviderEntry[];
  rent?: TmdbProviderEntry[];
  buy?: TmdbProviderEntry[];
}

interface TmdbWatchProviderResponse {
  id?: number;
  results?: Record<string, TmdbRegionProviders>;
}

export interface TmdbClientOptions {  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
}

export class TmdbClient {
  constructor(private readonly options: TmdbClientOptions) {}

  get configured(): boolean {
    return this.options.apiKey.trim().length > 0;
  }

  /** Multi-search, filtered to the movie and TV results Couchlist supports. */
  async search(query: string, limit = 10): Promise<MediaSummary[]> {
    if (!this.configured) return [];

    const data = await this.request<{ results: TmdbSearchItem[] }>(
      "/search/multi",
      {
        query,
        include_adult: "false",
        page: "1",
      },
    );

    return (data.results ?? [])
      .filter(
        (item) =>
          !item.adult &&
          (item.media_type === "movie" || item.media_type === "tv"),
      )
      .slice(0, limit)
      .map((item) =>
        toSummary(
          item,
          item.media_type === "tv" ? MediaType.TV : MediaType.MOVIE,
        ),
      );
  }

  /** Existing mixed feed kept for Home/backward compatibility. */
  async trending(limit = 8): Promise<MediaSummary[]> {
    if (!this.configured) return [];

    const data = await this.request<{ results: TmdbSearchItem[] }>(
      "/trending/all/day",
      {
        language: "en-US",
      },
    );

    return (data.results ?? [])
      .filter(
        (item) =>
          !item.adult &&
          (item.media_type === "movie" || item.media_type === "tv"),
      )
      .slice(0, limit)
      .map((item) =>
        toSummary(
          item,
          item.media_type === "tv" ? MediaType.TV : MediaType.MOVIE,
        ),
      );
  }

  async trendingMovies(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/trending/movie/day", MediaType.MOVIE, limit, page);
  }

  async popularMovies(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/movie/popular", MediaType.MOVIE, limit, page);
  }

  async topRatedMovies(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/movie/top_rated", MediaType.MOVIE, limit, page);
  }

  async trendingTv(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/trending/tv/day", MediaType.TV, limit, page);
  }

  async popularTv(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/tv/popular", MediaType.TV, limit, page);
  }

  async topRatedTv(limit = 10, page = 1): Promise<MediaSummary[]> {
    return this.list("/tv/top_rated", MediaType.TV, limit, page);
  }

  async byId(id: string, mediaType: MediaType): Promise<MediaDetail | null> {
    if (!this.configured) return null;
    if (mediaType !== MediaType.MOVIE && mediaType !== MediaType.TV)
      return null;
    if (!/^\d+$/.test(id)) return null;

    const segment = mediaType === MediaType.TV ? "tv" : "movie";
    const data = await this.request<TmdbDetail>(`/${segment}/${id}`, {});
    return data?.id ? toDetail(data, mediaType) : null;
  }

  /**
   * Where a title can legally be watched, per region.
   *
   * TMDB sources this from JustWatch and it carries an attribution requirement:
   * surfaces showing this data must credit JustWatch. TMDB reports a tier
   * (flatrate/free/ads/rent/buy) but never a resolution, so quality stays
   * unknown rather than being guessed.
   */
  async watchProviders(
    id: string,
    mediaType: MediaType,
    region = "US",
  ): Promise<ProviderWatchLink[]> {
    if (!this.configured) return [];
    if (mediaType !== MediaType.MOVIE && mediaType !== MediaType.TV) return [];
    if (!/^\d+$/.test(id)) return [];

    const segment = mediaType === MediaType.TV ? "tv" : "movie";
    const data = await this.request<TmdbWatchProviderResponse>(
      `/${segment}/${id}/watch/providers`,
      {},
    );

    const regional = data.results?.[region.toUpperCase()];
    if (!regional?.link) return [];

    // TMDB/JustWatch gives one chooser URL for the title/region, not a deep
    // link per streaming service. Represent that honestly as one JustWatch
    // destination and keep the actual service names/access tiers as metadata.
    // Creating one source row per provider would collapse onto the same domain
    // and would falsely imply provider-specific links that TMDB does not give us.
    const groups: Array<[TmdbProviderEntry[] | undefined, WatchAccessType]> = [
      [regional.free, WatchAccessType.FREE],
      [regional.ads, WatchAccessType.FREE_WITH_ADS],
      [regional.flatrate, WatchAccessType.SUBSCRIPTION],
      [regional.rent, WatchAccessType.RENT],
      [regional.buy, WatchAccessType.BUY],
    ];

    const providers = new Map<string, Set<WatchAccessType>>();
    for (const [entries, accessType] of groups) {
      for (const entry of entries ?? []) {
        const name = entry.provider_name?.trim();
        if (!name) continue;
        const accessTypes = providers.get(name) ?? new Set<WatchAccessType>();
        accessTypes.add(accessType);
        providers.set(name, accessTypes);
      }
    }

    if (providers.size === 0) return [];

    return [
      {
        sourceName: 'JustWatch',
        url: regional.link,
        sourceType: WatchSourceType.OFFICIAL,
        // The chooser can contain several different access models. Keep the
        // single-row field honest and expose the full set in metadata below.
        accessType: WatchAccessType.UNKNOWN,
        regionInfo: region.toUpperCase(),
        supportsAnime: false,
        supportsMovies: true,
        supportsTv: true,
        metadata: {
          attribution: 'justwatch',
          providerOptions: [...providers.entries()].map(([name, accessTypes]) => ({
            name,
            accessTypes: [...accessTypes],
          })),
        },
      },
    ];
  }

  private async list(
    path: string,
    mediaType: MediaType,
    limit: number,
    page = 1,
  ): Promise<MediaSummary[]> {    if (!this.configured) return [];

    const safePage = Math.max(1, Math.floor(page));
    const data = await this.request<{ results: TmdbSearchItem[] }>(path, {
      language: "en-US",
      page: String(safePage),
    });

    return (data.results ?? [])
      .filter((item) => !item.adult && Boolean(item.title ?? item.name))
      .slice(0, Math.min(limit, 20))
      .map((item) => toSummary(item, mediaType));
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}${path}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);

    // TMDB accepts either a v4 bearer token or a v3 key.
    const key = this.options.apiKey.trim();
    const headers: Record<string, string> = key.includes(".")
      ? { authorization: `Bearer ${key}` }
      : {};
    if (!key.includes(".")) url.searchParams.set("api_key", key);

    return fetchJson<T>(url.toString(), {
      timeoutMs: this.options.timeoutMs,
      providerName: "tmdb",
      headers,
    });
  }
}

function yearFrom(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function image(path: string | null | undefined, size: string): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function toSummary(item: TmdbSearchItem, mediaType: MediaType): MediaSummary {
  const detail = item as TmdbDetail;
  return {
    provider: MediaProvider.TMDB,
    providerMediaId: String(item.id),
    mediaType,
    title: item.title ?? item.name ?? `TMDB #${item.id}`,
    year: yearFrom(item.release_date ?? item.first_air_date),
    posterUrl: image(item.poster_path, "w500"),
    episodeCount:
      mediaType === MediaType.TV ? (detail.number_of_episodes ?? null) : null,
    runtimeMinutes:
      mediaType === MediaType.MOVIE ? (detail.runtime ?? null) : null,
    seasonCount:
      mediaType === MediaType.TV ? (detail.number_of_seasons ?? null) : null,
  };
}

function toDetail(item: TmdbDetail, mediaType: MediaType): MediaDetail {
  return {
    ...toSummary(item, mediaType),
    bannerUrl: image(item.backdrop_path, "w1280"),
    description: item.overview?.trim() || null,
    genres: (item.genres ?? []).map((genre) => genre.name),
    status: item.status ?? null,
    studio: item.production_companies?.[0]?.name ?? null,
    source: null,
  };
}
