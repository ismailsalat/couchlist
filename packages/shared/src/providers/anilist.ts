import { MediaProvider, MediaType } from '../media/identity.js';
import type { MediaDetail, MediaSummary } from '../media/types.js';
import { fetchJson } from './http.js';

/**
 * AniList adapter (anime only).
 *
 * We request exactly the fields Couchlist renders. Nothing here is stored
 * wholesale - the caller decides what to cache.
 */

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  seasonYear
  episodes
  status
  description(asHtml: false)
  genres
  bannerImage
  coverImage { large extraLarge }
  source
  studios(isMain: true) { nodes { name } }
`;

const SEARCH_QUERY = `
  query ($search: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
    }
  }
`;

const BY_ID_QUERY = `
  query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
  }
`;

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  seasonYear: number | null;
  episodes: number | null;
  status: string | null;
  description: string | null;
  genres: string[] | null;
  bannerImage: string | null;
  coverImage: { large: string | null; extraLarge: string | null } | null;
  source: string | null;
  studios: { nodes: Array<{ name: string }> } | null;
}

export interface AniListClientOptions {
  apiUrl: string;
  timeoutMs?: number;
}

export class AniListClient {
  constructor(private readonly options: AniListClientOptions) {}

  async search(query: string, limit = 10): Promise<MediaSummary[]> {
    const data = await this.request<{ Page: { media: AniListMedia[] } }>(SEARCH_QUERY, {
      search: query,
      perPage: Math.min(limit, 25),
    });
    return (data.Page?.media ?? []).map(toSummary);
  }

  async byId(id: string): Promise<MediaDetail | null> {
    const numeric = Number.parseInt(id, 10);
    if (!Number.isFinite(numeric)) return null;

    const data = await this.request<{ Media: AniListMedia | null }>(BY_ID_QUERY, { id: numeric });
    return data.Media ? toDetail(data.Media) : null;
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const payload = await fetchJson<{ data: T; errors?: Array<{ message: string }> }>(
      this.options.apiUrl,
      {
        method: 'POST',
        body: { query, variables },
        timeoutMs: this.options.timeoutMs,
        providerName: 'anilist',
      },
    );
    return payload.data;
  }
}

function preferredTitle(media: AniListMedia): string {
  return media.title.english ?? media.title.romaji ?? media.title.native ?? `AniList #${media.id}`;
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
    bannerUrl: media.bannerImage,
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ');
}
