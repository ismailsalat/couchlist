import { describe, expect, it } from 'vitest';
import { dedupeCrossCatalogSearch, type MediaSummary } from '@couchlist/shared';

function item(overrides: Partial<MediaSummary> & Pick<MediaSummary, 'provider' | 'providerMediaId' | 'mediaType' | 'title'>): MediaSummary {
  return {
    year: null,
    posterUrl: null,
    episodeCount: null,
    runtimeMinutes: null,
    seasonCount: null,
    ...overrides,
  };
}

describe('mixed catalog search dedupe', () => {
  it('keeps one Anime row and removes the same-year TMDB duplicate', () => {
    const results = dedupeCrossCatalogSearch([
      item({
        provider: 'KITSU',
        providerMediaId: '12',
        mediaType: 'ANIME',
        canonicalMediaKey: 'mal:21',
        title: 'One Piece',
        year: 1999,
      }),
      item({
        provider: 'TMDB',
        providerMediaId: '37854',
        mediaType: 'TV',
        title: 'One Piece',
        year: 1999,
      }),
      item({
        provider: 'TMDB',
        providerMediaId: '111110',
        mediaType: 'TV',
        title: 'ONE PIECE',
        year: 2023,
      }),
    ]);

    expect(results.map((result) => `${result.mediaType}:${result.year}`)).toEqual([
      'ANIME:1999',
      'TV:2023',
    ]);
  });

  it('dedupes the same Anime across provider ids when canonical keys match', () => {
    const results = dedupeCrossCatalogSearch([
      item({
        provider: 'ANILIST',
        providerMediaId: '30013',
        mediaType: 'ANIME',
        canonicalMediaKey: 'mal:21',
        title: 'One Piece',
        year: 1999,
      }),
      item({
        provider: 'JIKAN',
        providerMediaId: '21',
        mediaType: 'ANIME',
        canonicalMediaKey: 'mal:21',
        title: 'One Piece',
        year: 1999,
      }),
    ]);

    expect(results).toHaveLength(1);
  });
});
