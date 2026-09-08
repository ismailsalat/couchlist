import {
  MediaProvider,
  MediaType,
  canonicalAnimeKeyFromMalId,
} from '../media/identity.js';
import type { MediaDetail, MediaSummary } from '../media/types.js';
import { fetchJson } from './http.js';

/**
 * Kitsu adapter (anime only).
 *
 * Kitsu is Couchlist's independent Anime safety net. Public GET endpoints do
 * not require authentication, which makes it useful when AniList is blocked or
 * Jikan/MyAnimeList is having a bad minute.
 */

export type KitsuBrowseSort = 'trending' | 'popular' | 'top-rated';
export type KitsuBrowseFormat = 'all' | 'series' | 'movies';

export interface KitsuClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

interface KitsuImageSet {
  tiny?: string | null;
  small?: string | null;
  medium?: string | null;
  large?: string | null;
  original?: string | null;
}

interface KitsuAnimeAttributes {
  canonicalTitle?: string | null;
  titles?: {
    en?: string | null;
    en_jp?: string | null;
    ja_jp?: string | null;
  } | null;
  synopsis?: string | null;
  description?: string | null;
  posterImage?: KitsuImageSet | null;
  coverImage?: KitsuImageSet | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  subtype?: string | null;
  showType?: string | null;
  episodeCount?: number | null;
  episodeLength?: number | null;
  nsfw?: boolean | null;
}

interface KitsuResource {
  id: string;
  type: string;
  attributes?: KitsuAnimeAttributes | null;
  relationships?: {
    categories?: {
      data?: Array<{ id: string; type: string }>;
    } | null;
    mappings?: {
      data?: Array<{ id: string; type: string }>;
    } | null;
  } | null;
}

interface KitsuIncludedResource {
  id: string;
  type: string;
  attributes?: {
    title?: string | null;
    name?: string | null;
    externalSite?: string | null;
    externalId?: string | null;
  } | null;
}

interface KitsuCollectionResponse {
  data?: KitsuResource[];
  included?: KitsuIncludedResource[];
  links?: {
    next?: string | null;
  };
}

interface KitsuDetailResponse {
  data?: KitsuResource | null;
  included?: KitsuIncludedResource[];
}

interface KitsuMappingResource {
  id: string;
  type: string;
  attributes?: {
    externalSite?: string | null;
    externalId?: string | null;
  } | null;
  relationships?: {
    item?: {
      data?: { id: string; type: string } | null;
    } | null;
  } | null;
}

interface KitsuMappingResponse {
  data?: KitsuMappingResource[];
}

export interface KitsuBrowsePage {
  items: MediaSummary[];
  hasMore: boolean;
}

export class KitsuClient {
  constructor(private readonly options: KitsuClientOptions) {}

  async search(query: string, limit = 10): Promise<MediaSummary[]> {
    const payload = await this.get<KitsuCollectionResponse>('/anime', {
      'filter[text]': query,
      'page[limit]': String(clampLimit(limit)),
      'page[offset]': '0',
      include: 'mappings',
    });
    return normalAnime(payload.data).map((item) => toSummary(item, payload.included ?? []));
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
    sort: KitsuBrowseSort,
    page = 1,
    limit = 20,
    format: KitsuBrowseFormat = 'all',
  ): Promise<KitsuBrowsePage> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = clampLimit(limit);
    const params: Record<string, string> = {
      'page[limit]': String(safeLimit),
      'page[offset]': String((safePage - 1) * safeLimit),
      include: 'mappings',
    };

    // Kitsu exposes provider-native rank fields. Lower rank numbers are better,
    // so ascending order is what we want for popularity and rating shelves.
    // There is no first-class hourly trend rank; userCount is the closest
    // stable public fallback signal and is only used if AniList/Jikan fail.
    if (sort === 'top-rated') params.sort = 'ratingRank';
    else if (sort === 'popular') params.sort = 'popularityRank';
    else params.sort = '-userCount';

    if (format === 'movies') params['filter[subtype]'] = 'movie';
    if (format === 'series') params['filter[subtype]'] = 'TV,ONA,OVA,special';

    const payload = await this.get<KitsuCollectionResponse>('/anime', params);
    return {
      items: normalAnime(payload.data).map((item) => toSummary(item, payload.included ?? [])),
      hasMore: Boolean(payload.links?.next),
    };
  }

  async byId(id: string): Promise<MediaDetail | null> {
    if (!/^\d+$/.test(id)) return null;

    const payload = await this.get<KitsuDetailResponse>(`/anime/${id}`, {
      include: 'categories,mappings',
    });
    if (!payload.data || payload.data.type !== 'anime') return null;
    return toDetail(payload.data, payload.included ?? []);
  }

  /**
   * Resolve an id from another Anime catalog through Kitsu's mappings table.
   * This is mainly used to migrate old AniList rows even while AniList itself
   * is unavailable.
   */
  async byExternalId(
    externalSite: 'anilist/anime' | 'myanimelist/anime',
    externalId: string,
  ): Promise<MediaDetail | null> {
    if (!/^\d+$/.test(externalId)) return null;
    const payload = await this.get<KitsuMappingResponse>('/mappings', {
      'filter[externalSite]': externalSite,
      'filter[externalId]': externalId,
      'page[limit]': '1',
    });
    const item = payload.data?.[0]?.relationships?.item?.data;
    if (!item || item.type !== 'anime') return null;
    return this.byId(item.id);
  }

  async byMalId(malId: string): Promise<MediaDetail | null> {
    return this.byExternalId('myanimelist/anime', malId);
  }

  async byAniListId(anilistId: string): Promise<MediaDetail | null> {
    return this.byExternalId('anilist/anime', anilistId);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const base = this.options.baseUrl.replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    return fetchJson<T>(url.toString(), {
      providerName: 'kitsu',
      timeoutMs: this.options.timeoutMs,
      retries: 0,
      headers: {
        accept: 'application/vnd.api+json',
      },
    });
  }
}

function normalAnime(data: KitsuResource[] | undefined): KitsuResource[] {
  return (data ?? []).filter(
    (item) => item.type === 'anime' && item.attributes?.nsfw !== true,
  );
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, Math.floor(limit)), 20);
}

function toSummary(
  resource: KitsuResource,
  included: KitsuIncludedResource[] = [],
): MediaSummary {
  const attrs = resource.attributes ?? {};
  return {
    provider: MediaProvider.KITSU,
    providerMediaId: resource.id,
    mediaType: MediaType.ANIME,
    canonicalMediaKey: canonicalKeyFromMappings(resource, included),
    title:
      attrs.titles?.en ??
      attrs.canonicalTitle ??
      attrs.titles?.en_jp ??
      attrs.titles?.ja_jp ??
      `Kitsu #${resource.id}`,
    year: parseYear(attrs.startDate),
    posterUrl:
      attrs.posterImage?.large ??
      attrs.posterImage?.medium ??
      attrs.posterImage?.original ??
      attrs.posterImage?.small ??
      null,
    episodeCount: attrs.episodeCount ?? null,
    runtimeMinutes: null,
    seasonCount: null,
  };
}

function toDetail(
  resource: KitsuResource,
  included: KitsuIncludedResource[],
): MediaDetail {
  const attrs = resource.attributes ?? {};
  const categoryIds = new Set(
    resource.relationships?.categories?.data?.map((category) => category.id) ?? [],
  );
  const genres = included.flatMap((item) => {
    if (item.type !== 'categories' || !categoryIds.has(item.id)) return [];
    const label = item.attributes?.title ?? item.attributes?.name;
    return label ? [label] : [];
  });

  return {
    ...toSummary(resource, included),
    bannerUrl:
      attrs.coverImage?.large ??
      attrs.coverImage?.original ??
      attrs.coverImage?.small ??
      null,
    description: attrs.synopsis ?? attrs.description ?? null,
    genres,
    status: attrs.status ? titleCase(attrs.status) : null,
    studio: null,
    source: null,
  };
}

function canonicalKeyFromMappings(
  resource: KitsuResource,
  included: KitsuIncludedResource[],
): string | null {
  const mappingIds = new Set(
    resource.relationships?.mappings?.data?.map((mapping) => mapping.id) ?? [],
  );
  for (const item of included) {
    if (item.type !== 'mappings' || !mappingIds.has(item.id)) continue;
    if (item.attributes?.externalSite !== 'myanimelist/anime') continue;
    const key = canonicalAnimeKeyFromMalId(item.attributes.externalId ?? '');
    if (key) return key;
  }
  return null;
}

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
