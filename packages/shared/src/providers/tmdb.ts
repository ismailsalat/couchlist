import { MediaProvider, MediaType } from "../media/identity.js";
import type { MediaDetail, MediaSummary } from "../media/types.js";
import { fetchJson } from "./http.js";

/**
 * TMDB adapter (movies and TV).
 *
 * The API key goes in a header, never in a URL, so it cannot end up in a log,
 * a referrer or an error message.
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

export interface TmdbClientOptions {
  apiKey: string;
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
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, limit)
      .map((item) =>
        toSummary(
          item,
          item.media_type === "tv" ? MediaType.TV : MediaType.MOVIE,
        ),
      );
  }

  /** Global day-trending movies and TV, filtered to media Couchlist supports. */
  async trending(limit = 8): Promise<MediaSummary[]> {
    if (!this.configured) return [];

    const data = await this.request<{ results: TmdbSearchItem[] }>(
      "/trending/all/day",
      {
        language: "en-US",
      },
    );

    return (data.results ?? [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, limit)
      .map((item) =>
        toSummary(
          item,
          item.media_type === "tv" ? MediaType.TV : MediaType.MOVIE,
        ),
      );
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

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, "")}${path}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);

    // TMDB accepts either a v4 bearer token or a v3 key. Detect which we have
    // and send it as a header either way - never as a query parameter.
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
