import { describe, expect, it } from 'vitest';
import {
  calculateTasteMatch,
  MIN_SHARED_RATINGS,
  type RatedEntry,
} from '@couchlist/shared';

function anime(id: string, title: string, rating: number | null, completed = true): RatedEntry {
  return {
    provider: 'ANILIST',
    providerMediaId: id,
    mediaType: 'ANIME',
    title,
    rating,
    completed,
  };
}

describe('taste match', () => {
  it('refuses to score without enough shared ratings', () => {
    const result = calculateTasteMatch(
      [anime('1', 'Attack on Titan', 9)],
      [anime('1', 'Attack on Titan', 8)],
    );
    expect(result.status).toBe('not_enough_data');
    if (result.status === 'not_enough_data') {
      expect(result.sharedRatedTitles).toBe(1);
      expect(result.needed).toBe(MIN_SHARED_RATINGS - 1);
    }
  });

  it('scores identical ratings as a perfect match', () => {
    const entries = [anime('1', 'A', 9), anime('2', 'B', 7), anime('3', 'C', 5)];
    const result = calculateTasteMatch(entries, entries);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.matchPercent).toBe(100);
  });

  it('scores maximum disagreement as zero', () => {
    const a = [anime('1', 'A', 1), anime('2', 'B', 1), anime('3', 'C', 1)];
    const b = [anime('1', 'A', 10), anime('2', 'B', 10), anime('3', 'C', 10)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.matchPercent).toBe(0);
  });

  it('computes the documented example correctly', () => {
    // Mean difference of 1 point across 3 titles => 1 - 1/9 => 89%
    const a = [anime('1', 'A', 9), anime('2', 'B', 8), anime('3', 'C', 7)];
    const b = [anime('1', 'A', 8), anime('2', 'B', 7), anime('3', 'C', 6)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.matchPercent).toBe(89);
  });

  it('is symmetric', () => {
    const a = [anime('1', 'A', 10), anime('2', 'B', 6), anime('3', 'C', 8)];
    const b = [anime('1', 'A', 7), anime('2', 'B', 9), anime('3', 'C', 8)];
    const forward = calculateTasteMatch(a, b);
    const backward = calculateTasteMatch(b, a);
    if (forward.status !== 'ok' || backward.status !== 'ok') throw new Error('expected scores');
    expect(forward.matchPercent).toBe(backward.matchPercent);
  });

  it('is deterministic across repeated runs', () => {
    const a = [anime('1', 'A', 9), anime('2', 'B', 4), anime('3', 'C', 7), anime('4', 'D', 10)];
    const b = [anime('1', 'A', 8), anime('2', 'B', 9), anime('3', 'C', 7), anime('4', 'D', 6)];
    const results = new Set(
      Array.from({ length: 20 }, () => JSON.stringify(calculateTasteMatch(a, b))),
    );
    expect(results.size).toBe(1);
  });

  it('ignores titles only one person rated', () => {
    const a = [anime('1', 'A', 9), anime('2', 'B', 9), anime('3', 'C', 9), anime('4', 'Solo', 1)];
    const b = [anime('1', 'A', 9), anime('2', 'B', 9), anime('3', 'C', 9)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.matchPercent).toBe(100);
    expect(result.sharedRatedTitles).toBe(3);
  });

  it('counts shared titles even when unrated', () => {
    const a = [anime('1', 'A', 9), anime('2', 'B', 8), anime('3', 'C', 7), anime('4', 'D', null)];
    const b = [anime('1', 'A', 9), anime('2', 'B', 8), anime('3', 'C', 7), anime('4', 'D', null)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.sharedTitles).toBe(4);
    expect(result.sharedRatedTitles).toBe(3);
  });

  it('does not treat the same id from different providers as the same title', () => {
    const a: RatedEntry[] = [
      { provider: 'ANILIST', providerMediaId: '1396', mediaType: 'ANIME', title: 'Anime', rating: 9, completed: true },
      anime('2', 'B', 8),
      anime('3', 'C', 7),
    ];
    const b: RatedEntry[] = [
      { provider: 'TMDB', providerMediaId: '1396', mediaType: 'TV', title: 'Breaking Bad', rating: 2, completed: true },
      anime('2', 'B', 8),
      anime('3', 'C', 7),
    ];
    const result = calculateTasteMatch(a, b);
    expect(result.status).toBe('not_enough_data');
  });

  it('lists titles both people loved, best first', () => {
    const a = [anime('1', 'Great', 10), anime('2', 'Good', 8), anime('3', 'Meh', 4)];
    const b = [anime('1', 'Great', 9), anime('2', 'Good', 8), anime('3', 'Meh', 5)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.bothLoved.map((item) => item.title)).toEqual(['Great', 'Good']);
  });

  it('finds the biggest disagreement', () => {
    const a = [anime('1', 'Jujutsu Kaisen', 9), anime('2', 'B', 8), anime('3', 'C', 7)];
    const b = [anime('1', 'Jujutsu Kaisen', 5), anime('2', 'B', 8), anime('3', 'C', 6)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.biggestDisagreements[0]?.title).toBe('Jujutsu Kaisen');
    expect(result.biggestDisagreements[0]?.difference).toBe(4);
  });

  it('recommends highly rated titles the other person has not added', () => {
    const a = [
      anime('1', 'A', 9),
      anime('2', 'B', 8),
      anime('3', 'C', 7),
      anime('9', 'Vinland Saga', 9),
    ];
    const b = [anime('1', 'A', 9), anime('2', 'B', 8), anime('3', 'C', 7)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.aRecommendsToB.map((item) => item.title)).toEqual(['Vinland Saga']);
    expect(result.bRecommendsToA).toHaveLength(0);
  });

  it('never recommends something the other person already has', () => {
    const a = [anime('1', 'A', 10), anime('2', 'B', 10), anime('3', 'C', 10)];
    const b = [anime('1', 'A', 6), anime('2', 'B', 6), anime('3', 'C', 6)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.aRecommendsToB).toHaveLength(0);
  });

  it('handles two users with nothing in common', () => {
    const result = calculateTasteMatch([anime('1', 'A', 9)], [anime('2', 'B', 9)]);
    expect(result.status).toBe('not_enough_data');
    if (result.status === 'not_enough_data') expect(result.sharedTitles).toBe(0);
  });

  it('handles empty lists without throwing', () => {
    expect(calculateTasteMatch([], []).status).toBe('not_enough_data');
  });

  it('keeps the score within 0-100 for half point ratings', () => {
    const a = [anime('1', 'A', 9.5), anime('2', 'B', 1), anime('3', 'C', 5.5)];
    const b = [anime('1', 'A', 1), anime('2', 'B', 10), anime('3', 'C', 5.5)];
    const result = calculateTasteMatch(a, b);
    if (result.status !== 'ok') throw new Error('expected a score');
    expect(result.matchPercent).toBeGreaterThanOrEqual(0);
    expect(result.matchPercent).toBeLessThanOrEqual(100);
  });
});
