import { AppError, ERROR_CODES } from "../errors/index.js";
import {
  MediaProvider,
  MediaType,
  canonicalAnimeKeyFromMalId,
} from "../media/identity.js";
import type { MediaDetail, MediaSummary } from "../media/types.js";
import { fetchJson } from "./http.js";

/**
 * AniList adapter (anime only).
 *
 * Search and browse intentionally request summary fields only. Detail-only
 * fields are fetched when somebody opens a title page. Browse queries keep the
 * GraphQL shape deliberately boring: sort and format filters are written into
 * the query as known enum values instead of being passed as enum arrays. That
 * mirrors AniList's documented browse examples and removes one more moving part
 * from the most important discovery path.
 */

const SUMMARY_FIELDS = `
  id
  idMal
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

const BROWSE_SORT: Record<AniListBrowseSort, string> = {
  trending: "TRENDING_DESC",
  popular: "POPULARITY_DESC",
  "top-rated": "SCORE_DESC",
};

function formatClause(format: AniListBrowseFormat): string {
  if (format === "movies") return "format: MOVIE";
  if (format === "series") {
    return "format_in: [TV, TV_SHORT, OVA, ONA, SPECIAL]";
  }
  // All Anime means every normal anime format except music-video entries.
  return "format_not: MUSIC";
}

function browsePageQuery(
  sort: AniListBrowseSort,
  format: AniListBrowseFormat,
): string {
  return `
    query ($page: Int!, $perPage: Int!) {
      Page(page: $page, perPage: $perPage) {
        media(
          type: ANIME
          sort: ${BROWSE_SORT[sort]}
          ${formatClause(format)}
          isAdult: false
        ) { ${SUMMARY_FIELDS} }
      }
    }
  `;
}

/**
 * One request powers both Anime shelves on the All browse page. During AniList's
 * current lower rate limit this matters: opening Search should cost one Anime
 * request, not two simultaneous requests.
 */
const BROWSE_OVERVIEW_QUERY = `
  query ($perPage: Int!) {
    trending: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, sort: TRENDING_DESC, format_not: MUSIC, isAdult: false) {
        ${SUMMARY_FIELDS}
      }
    }
    popular: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC, format_not: MUSIC, isAdult: false) {
        ${SUMMARY_FIELDS}
      }
    }
  }
`;

const BY_ID_QUERY = `
  query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${DETAIL_FIELDS} }
  }
`;

const BY_MAL_ID_QUERY = `
  query ($idMal: Int!) {
    Media(idMal: $idMal, type: ANIME) { ${DETAIL_FIELDS} }
  }
`;

interface AniListMedia {
  id: number;
  idMal?: number | null;
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

interface GraphQlError {
  message?: string;
  status?: number;
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

  /** Both starter shelves use one GraphQL request. */
  async browse(limit = 10): Promise<AniListBrowse> {
    const data = await this.request<{
      trending: { media: AniListMedia[] };
      popular: { media: AniListMedia[] };
    }>(BROWSE_OVERVIEW_QUERY, {
      perPage: Math.min(Math.max(1, limit), 25),
    });

    return {
      trending: (data.trending?.media ?? []).map(toSummary),
      popular: (data.popular?.media ?? []).map(toSummary),
    };
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
      browsePageQuery(sort, format),
      {
        page: safePage,
        perPage: Math.min(Math.max(1, limit), 50),
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

  /** Resolve a canonical MAL id back to AniList when the normal provider is down. */
  async byMalId(id: string): Promise<MediaDetail | null> {
    const numeric = Number.parseInt(id, 10);
    if (!Number.isFinite(numeric)) return null;

    const data = await this.request<{ Media: AniListMedia | null }>(
      BY_MAL_ID_QUERY,
      { idMal: numeric },
    );
    return data.Media ? toDetail(data.Media) : null;
  }

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const payload = await fetchJson<{
      data?: T;
      errors?: GraphQlError[];
    }>(this.options.apiUrl, {
      method: "POST",
      body: { query, variables },
      timeoutMs: this.options.timeoutMs,
      // Immediate retries are counterproductive now that Couchlist has two
      // independent Anime fallbacks. Let the web layer fail over instead.
      retries: 0,
      providerName: "anilist",
    });

    if (!payload.data) {
      const firstStatus = payload.errors?.find(
        (error) => typeof error.status === "number",
      )?.status;
      throw new AppError(ERROR_CODES.CL_MEDIA_PROVIDER_ERROR, {
        message: "AniList returned no usable data",
        context: {
          providerName: "anilist",
          graphqlErrors: payload.errors?.length ?? 0,
          ...(typeof firstStatus === "number"
            ? { providerStatus: firstStatus }
            : {}),
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
    canonicalMediaKey: canonicalAnimeKeyFromMalId(media.idMal ?? ""),
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
