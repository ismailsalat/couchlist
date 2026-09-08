import { z } from 'zod';

/**
 * Media identity.
 *
 * A provider id alone is never unique - AniList 16498 and TMDB 16498 are
 * different things, and TMDB reuses ids across movies and TV. Everything in
 * Couchlist therefore keys on the triple (provider, providerMediaId, mediaType).
 */
export const MediaProvider = {
  ANILIST: 'ANILIST',
  TMDB: 'TMDB',
} as const;
export type MediaProvider = (typeof MediaProvider)[keyof typeof MediaProvider];

export const MediaType = {
  ANIME: 'ANIME',
  MOVIE: 'MOVIE',
  TV: 'TV',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const mediaProviderSchema = z.nativeEnum(MediaProvider);
export const mediaTypeSchema = z.nativeEnum(MediaType);

export const mediaIdentitySchema = z.object({
  provider: mediaProviderSchema,
  providerMediaId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  mediaType: mediaTypeSchema,
});

export type MediaIdentity = z.infer<typeof mediaIdentitySchema>;

/** Provider/type pairs that actually exist. Anything else is a client bug. */
const VALID_COMBINATIONS: Record<MediaProvider, MediaType[]> = {
  ANILIST: [MediaType.ANIME],
  TMDB: [MediaType.MOVIE, MediaType.TV],
};

export function isValidIdentity(identity: MediaIdentity): boolean {
  return VALID_COMBINATIONS[identity.provider].includes(identity.mediaType);
}

/** Stable string key for caches, maps and grouping. */
export function mediaKey(identity: MediaIdentity): string {
  return `${identity.provider}:${identity.mediaType}:${identity.providerMediaId}`;
}

export function parseMediaKey(key: string): MediaIdentity | null {
  const [provider, mediaType, providerMediaId] = key.split(':');
  const parsed = mediaIdentitySchema.safeParse({ provider, mediaType, providerMediaId });
  if (!parsed.success || !isValidIdentity(parsed.data)) return null;
  return parsed.data;
}

/** URL path segment for a title page: /media/anilist/anime/16498 */
export function mediaPath(identity: MediaIdentity): string {
  return `/media/${identity.provider.toLowerCase()}/${identity.mediaType.toLowerCase()}/${identity.providerMediaId}`;
}

/** Episode progress only makes sense for serialised media. */
export function supportsEpisodeProgress(mediaType: MediaType): boolean {
  return mediaType === MediaType.ANIME || mediaType === MediaType.TV;
}
