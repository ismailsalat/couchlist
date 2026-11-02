import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  SourceSort,
  bayesianAverage,
  categoriesFromFlags,
  compareSources,
  confidenceWeightedLikeRatio,
  flagsFromCategories,
  likeRatio,
  normalizeSearchText,
  parseCategoryFilter,
  parseSourceSort,
  recommendedScore,
  weightedWatchRating,
} from '@couchlist/shared';

describe('confidence-aware ranking', () => {
  /**
   * The rule this ranking exists to enforce. A source with a single positive
   * vote must not outrank a well-established one on percentage alone.
   */
  it('ranks an established source above one with a single lucky vote', () => {
    const lucky = { name: 'Lucky', likes: 1, dislikes: 0 };
    const established = { name: 'Established', likes: 80, dislikes: 20 };

    expect(likeRatio(lucky)).toBe(1);
    expect(likeRatio(established)).toBe(0.8);

    // Raw percentage says the opposite; the weighted score does not.
    expect(recommendedScore(established)).toBeGreaterThan(recommendedScore(lucky));
  });

  it('treats an unvoted source as unknown rather than bad', () => {
    expect(likeRatio({ likes: 0, dislikes: 0 })).toBeNull();
    expect(confidenceWeightedLikeRatio({ likes: 0, dislikes: 0 })).toBe(0.5);
  });

  it('moves a small sample toward the prior and leaves a large one alone', () => {
    expect(confidenceWeightedLikeRatio({ likes: 2, dislikes: 0 })).toBeCloseTo(0.6, 5);
    expect(confidenceWeightedLikeRatio({ likes: 80, dislikes: 20 })).toBeCloseTo(0.7778, 3);
    expect(confidenceWeightedLikeRatio({ likes: 800, dislikes: 200 })).toBeCloseTo(0.7976, 3);
  });

  it('subtracts the operator penalty', () => {
    const base = { name: 'X', likes: 90, dislikes: 10 };
    expect(recommendedScore({ ...base, adminRankPenalty: 50 })).toBeCloseTo(
      recommendedScore(base) - 0.5,
      5,
    );
  });

  it('clamps a nonsensical penalty instead of inverting the score', () => {
    const base = { name: 'X', likes: 10, dislikes: 0 };
    expect(recommendedScore({ ...base, adminRankPenalty: -100 })).toBe(recommendedScore(base));
    expect(recommendedScore({ ...base, adminRankPenalty: 5000 })).toBeCloseTo(
      recommendedScore(base) - 1,
      5,
    );
  });

  it('shares its shrinkage with the existing watch-source rating', () => {
    // Same calculation, different prior: one implementation, not two.
    expect(weightedWatchRating(5, 1)).toBeCloseTo(bayesianAverage(5, 1, 3.5, 5), 10);
    // Unrated stays 0 rather than becoming a middling score.
    expect(weightedWatchRating(null, 0)).toBe(0);
  });

  it('breaks ties by vote count, then name, so order is stable', () => {
    const rows = [
      { name: 'Zebra', likes: 4, dislikes: 1 },
      { name: 'Apple', likes: 4, dislikes: 1 },
      { name: 'Many', likes: 40, dislikes: 10 },
    ];
    const once = [...rows].sort(compareSources(SourceSort.RECOMMENDED)).map((r) => r.name);
    const twice = [...rows].reverse().sort(compareSources(SourceSort.RECOMMENDED)).map((r) => r.name);

    expect(once).toEqual(twice);
    expect(once[0]).toBe('Many');
    expect(once.slice(1)).toEqual(['Apple', 'Zebra']);
  });

  it('sorts by name and by newest when asked', () => {
    const rows = [
      { name: 'B', likes: 0, dislikes: 0, createdAt: new Date('2024-01-01') },
      { name: 'A', likes: 99, dislikes: 0, createdAt: new Date('2025-01-01') },
    ];
    expect([...rows].sort(compareSources(SourceSort.NAME)).map((r) => r.name)).toEqual(['A', 'B']);
    expect([...rows].sort(compareSources(SourceSort.NEWEST)).map((r) => r.name)).toEqual(['A', 'B']);
  });

  it('defaults an unknown sort to recommended', () => {
    expect(parseSourceSort('nonsense')).toBe(SourceSort.RECOMMENDED);
    expect(parseSourceSort(undefined)).toBe(SourceSort.RECOMMENDED);
    expect(parseSourceSort('newest')).toBe(SourceSort.NEWEST);
  });
});

describe('source categories', () => {
  it('round-trips between categories and column flags', () => {
    const categories = ['Anime', 'Manhwa', 'Comics'] as const;
    const flags = flagsFromCategories([...categories]);

    expect(flags).toEqual({
      supportsAnime: true,
      supportsMovies: false,
      supportsTv: false,
      supportsManga: false,
      supportsManhwa: true,
      supportsComics: true,
    });
    expect(categoriesFromFlags(flags)).toEqual(['Anime', 'Manhwa', 'Comics']);
  });

  it('supports a source in more than one category', () => {
    const flags = flagsFromCategories(['Manga', 'Manhwa']);
    expect(categoriesFromFlags(flags)).toHaveLength(2);
  });

  /** "manwha" is the misspelling the brief calls out by name. */
  it('normalises the manwha misspelling to manhwa', () => {
    expect(normalizeSearchText('manwha')).toBe('manhwa');
    expect(normalizeSearchText('Best MANWHA sites')).toBe('best manhwa sites');
    expect(parseCategoryFilter('manwha')).toBe('Manhwa');
  });

  it('accepts a category in any case and falls back to All', () => {
    expect(parseCategoryFilter('MOVIES')).toBe('Movies');
    expect(parseCategoryFilter('tv')).toBe('TV');
    expect(parseCategoryFilter('nonsense')).toBe(ALL_CATEGORIES);
    expect(parseCategoryFilter(null)).toBe(ALL_CATEGORIES);
    expect(parseCategoryFilter('')).toBe(ALL_CATEGORIES);
  });
});
