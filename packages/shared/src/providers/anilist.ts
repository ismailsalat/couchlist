import { AppError, ERROR_CODES } from "../errors/index.js";
import { MediaProvider, MediaType } from "../media/identity.js";
import type { MediaDetail, MediaSummary } from "../media/types.js";
import { fetchJson } from "./http.js";

/**
 * AniList adapter (anime only).
 *
 * Browse/search requests intentionally ask for summary fields only. Detail-only
 * fields are fetched when somebody opens a title page. Discovery uses one
 * provider-native paged query for every ranking so the same path powers Home,
 * Search, long browse, anime series, and anime movies.
 */

const SUMMARY_FIELDS = `
  id
  title { romaji english native }
  seasonYear
  episodes
  coverImage { large extraLarge }
`;

const DETAIL_FIELDS = `
  ${SUMMARY_FIELDS}
  status
  description(asHtml: false)
  genres
  bannerImage
  source
  studios(isMain: true) { nodes { name } }
`;

const SEARCH_QUERY = `
  query ($search: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${SUMMARY_FIELDS} }
    }
  }
`;

export type AniListBrowseSort = "trending" | "popular" | "top-rated";
export type AniListBrowseFormat = "all" | "series" | "movies";

const BROWSE_SORT: Record<AniListBrowseSort, string[]> = {
  trending: ["TRENDING_DESC"],
  popular: ["POPULARITY_DESC"],
  "top-rated": ["SCORE_DESC"],
};

/**
 * Keep music-video entries out of normal browsing. "All" means the formats a
 * Couchlist user would reasonably think of as an anime title: series, OVAs,
 * ONAs, specials, and theatrical movies.
 */
const BROWSE_FORMATS: Record<AniListBrowseFormat, string[]> = {
  all: ["TV", "TV_SHORT", "OVA", "ONA", "SPECIAL", "MOVIE"],
  series: ["TV", "TV_SHORT", "OVA", "ONA", "SPECIAL"],
  movies: ["MOVIE"],
};

const BROWSE_PAGE_QUERY = `
  query ($page: Int!, $perPage: Int!, $sort: [MediaSort], $formats: [MediaFormat]) {
    Page(page: $page, perPage: $perPage) {
      media(
        type: ANIME
        sort: $sort
        format_in: $formats
        isAdult: false
      ) { ${SUMMARY_FIELDS} }
    }
  }
`;

const BY_ID_QUERY = `
  query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${DETAIL_FIELDS} }
  }
`;

interface AniListMedia {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  seasonYear: number | null;
  episodes: number | null;
  status?: string | null;
  description?: string | null;
  genres?: string[] | null;
  bannerImage?: string | null;
  coverImage: { large: string | null; extraLarge: string | null } | null;
  source?: string | null;
  studios?: { nodes: Array<{ name: string }> } | null;
}

export interface AniListClientOptions {
  apiUrl: string;
  timeoutMs?: number;
}

export interface AniListBrowse {
  trending: MediaSummary[];
  popular: MediaSummary[];
}

export class AniListClient {
  constructor(private readonly options: AniListClientOptions) {}

  async search(query: string, limit = 10): Promise<MediaSummary[]> {
    const data = await this.request<{ Page: { media: AniListMedia[] } }>(
      SEARCH_QUERY,
      {
        search: query,
        perPage: Math.min(limit, 25),
      },
    );
    return (data.Page?.media ?? []).map(toSummary);
  }

  async trending(limit = 8): Promise<MediaSummary[]> {
    return this.browsePage("trending", 1, limit, "all");
  }

  /** Both starter shelves use the exact same reliable paged query as long browse. */
  async browse(limit = 10): Promise<AniListBrowse> {
    const [trending, popular] = await Promise.all([
      this.browsePage("trending", 1, limit, "all"),
      this.browsePage("popular", 1, limit, "all"),
    ]);
    return { trending, popular };
  }

  /** Provider-native page used by the long catalog view. */
  async browsePage(
    sort: AniListBrowseSort,
    page = 1,
    limit = 20,
    format: AniListBrowseFormat = "all",
  ): Promise<MediaSummary[]> {
    const safePage = Math.max(1, Math.floor(page));
    const data = await this.request<{ Page: { media: AniListMedia[] } }>(
      BROWSE_PAGE_QUERY,
      {
        page: safePage,
        perPage: Math.min(Math.max(1, limit), 50),
        sort: BROWSE_SORT[sort],
        formats: BROWSE_FORMATS[format],
      },
    );
    return (data.Page?.media ?? []).map(toSummary);
  }

  async byId(id: string): Promise<MediaDetail | null> {
    const numeric = Number.parseInt(id, 10);
    if (!Number.isFinite(numeric)) return null;

    const data = await this.request<{ Media: AniListMedia | null }>(
      BY_ID_QUERY,
      { id: numeric },
    );
    return data.Media ? toDetail(data.Media) : null;
  }

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const payload = await fetchJson<{
      data?: T;
      errors?: Array<{ message: string }>;
    }>(this.options.apiUrl, {
      method: "POST",
      body: { query, variables },
      timeoutMs: this.options.timeoutMs,
      providerName: "anilist",
    });

    if (!payload.data) {
      throw new AppError(ERROR_CODES.CL_MEDIA_PROVIDER_ERROR, {
        message: "AniList returned no usable data",
        context: {
          providerName: "anilist",
          graphqlErrors: payload.errors?.length ?? 0,
        },
      });
    }

    return payload.data;
  }
}

function preferredTitle(media: AniListMedia): string {
  return (
    media.title.english ??
    media.title.romaji ??
    media.title.native ??
    `AniList #${media.id}`
  );
}

function toSummary(media: AniListMedia): MediaSummary {
  return {
    provider: MediaProvider.ANILIST,
    providerMediaId: String(media.id),
    mediaType: MediaType.ANIME,
    title: preferredTitle(media),
    year: media.seasonYear,
    posterUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    episodeCount: media.episodes,
    runtimeMinutes: null,
    seasonCount: null,
  };
}

function toDetail(media: AniListMedia): MediaDetail {
  return {
    ...toSummary(media),
    bannerUrl: media.bannerImage ?? null,
    description: media.description ? stripHtml(media.description) : null,
    genres: media.genres ?? [],
    status: media.status ? titleCase(media.status) : null,
    studio: media.studios?.nodes?.[0]?.name ?? null,
    source: media.source ? titleCase(media.source) : null,
  };
}

/** AniList descriptions contain light HTML even with asHtml:false. */
function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}
