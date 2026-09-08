import { describe, expect, it } from 'vitest';
import {
  isValidIdentity,
  mediaIdentitySchema,
  mediaKey,
  mediaPath,
  parseMediaKey,
  supportsEpisodeProgress,
} from '@couchlist/shared';

describe('media identity', () => {
  it('accepts the documented examples', () => {
    for (const identity of [
      { provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' },
      { provider: 'TMDB', providerMediaId: '157336', mediaType: 'MOVIE' },
      { provider: 'TMDB', providerMediaId: '1396', mediaType: 'TV' },
    ] as const) {
      expect(isValidIdentity(mediaIdentitySchema.parse(identity))).toBe(true);
    }
  });

  it('rejects impossible provider and type combinations', () => {
    expect(
      isValidIdentity({ provider: 'ANILIST', providerMediaId: '1', mediaType: 'MOVIE' }),
    ).toBe(false);
    expect(isValidIdentity({ provider: 'TMDB', providerMediaId: '1', mediaType: 'ANIME' })).toBe(
      false,
    );
  });

  it('treats the same id from different providers as different media', () => {
    const anime = { provider: 'ANILIST', providerMediaId: '1396', mediaType: 'ANIME' } as const;
    const tv = { provider: 'TMDB', providerMediaId: '1396', mediaType: 'TV' } as const;
    expect(mediaKey(anime)).not.toBe(mediaKey(tv));
  });

  it('treats the same TMDB id as different across movie and TV', () => {
    const movie = { provider: 'TMDB', providerMediaId: '1396', mediaType: 'MOVIE' } as const;
    const tv = { provider: 'TMDB', providerMediaId: '1396', mediaType: 'TV' } as const;
    expect(mediaKey(movie)).not.toBe(mediaKey(tv));
  });

  it('round-trips a media key', () => {
    const identity = { provider: 'TMDB', providerMediaId: '157336', mediaType: 'MOVIE' } as const;
    expect(parseMediaKey(mediaKey(identity))).toEqual(identity);
  });

  it('rejects a malformed key', () => {
    expect(parseMediaKey('nonsense')).toBeNull();
    expect(parseMediaKey('ANILIST:MOVIE:1')).toBeNull();
  });

  it('rejects injection attempts in a provider id', () => {
    for (const bad of ["1'; drop table users;--", '../../etc/passwd', '1 OR 1=1', '<script>']) {
      expect(
        mediaIdentitySchema.safeParse({
          provider: 'TMDB',
          providerMediaId: bad,
          mediaType: 'MOVIE',
        }).success,
      ).toBe(false);
    }
  });

  it('builds a title page path', () => {
    expect(
      mediaPath({ provider: 'ANILIST', providerMediaId: '16498', mediaType: 'ANIME' }),
    ).toBe('/media/anilist/anime/16498');
  });

  it('knows which media types have episodes', () => {
    expect(supportsEpisodeProgress('ANIME')).toBe(true);
    expect(supportsEpisodeProgress('TV')).toBe(true);
    expect(supportsEpisodeProgress('MOVIE')).toBe(false);
  });
});
