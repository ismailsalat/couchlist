import { describe, expect, it } from 'vitest';
import {
  findWatchTogether,
  PLAN_TO_WATCH_POINTS,
  UNWATCHED_POINTS,
  type GroupEntry,
} from '@couchlist/shared';

function entry(
  userId: string,
  id: string,
  title: string,
  status: GroupEntry['status'],
  mediaType: GroupEntry['mediaType'] = 'ANIME',
): GroupEntry {
  return {
    userId,
    provider: mediaType === 'ANIME' ? 'ANILIST' : 'TMDB',
    providerMediaId: id,
    mediaType,
    title,
    posterUrl: null,
    status,
  };
}

describe('watch together', () => {
  it('scores plan-to-watch above never-watched', () => {
    const [result] = findWatchTogether(
      [entry('a', '1', 'Frieren', 'PLAN_TO_WATCH')],
      { userIds: ['a', 'b'] },
    );
    // One plan-to-watch (+3) plus one person who has not added it (+1).
    expect(result?.score).toBe(PLAN_TO_WATCH_POINTS + UNWATCHED_POINTS);
    expect(result?.planToWatchCount).toBe(1);
    expect(result?.unwatchedCount).toBe(1);
  });

  it('ranks the title the most people want to watch first', () => {
    const entries = [
      entry('a', '1', 'Wanted By Both', 'PLAN_TO_WATCH'),
      entry('b', '1', 'Wanted By Both', 'PLAN_TO_WATCH'),
      entry('a', '2', 'Wanted By One', 'PLAN_TO_WATCH'),
    ];
    const results = findWatchTogether(entries, { userIds: ['a', 'b'] });
    expect(results[0]?.title).toBe('Wanted By Both');
  });

  it('excludes titles somebody completed', () => {
    const entries = [
      entry('a', '1', 'Seen It', 'PLAN_TO_WATCH'),
      entry('b', '1', 'Seen It', 'COMPLETED'),
    ];
    expect(findWatchTogether(entries, { userIds: ['a', 'b'] })).toHaveLength(0);
  });

  it('includes completed titles when rewatching is allowed', () => {
    const entries = [
      entry('a', '1', 'Seen It', 'PLAN_TO_WATCH'),
      entry('b', '1', 'Seen It', 'COMPLETED'),
    ];
    const results = findWatchTogether(entries, { userIds: ['a', 'b'], allowRewatch: true });
    expect(results).toHaveLength(1);
    expect(results[0]?.completedBy).toEqual(['b']);
  });

  it('only suggests titles at least one participant wants to watch', () => {
    // Everyone is mid-watch; nothing is on a plan-to-watch list.
    const entries = [entry('a', '1', 'Ongoing', 'WATCHING'), entry('b', '1', 'Ongoing', 'WATCHING')];
    expect(findWatchTogether(entries, { userIds: ['a', 'b'] })).toHaveLength(0);
  });

  it('ignores entries from people who are not participating', () => {
    const entries = [
      entry('a', '1', 'Wanted', 'PLAN_TO_WATCH'),
      entry('outsider', '1', 'Wanted', 'PLAN_TO_WATCH'),
    ];
    const [result] = findWatchTogether(entries, { userIds: ['a', 'b'] });
    expect(result?.planToWatchCount).toBe(1);
  });

  it('filters by media type', () => {
    const entries = [
      entry('a', '1', 'An Anime', 'PLAN_TO_WATCH', 'ANIME'),
      entry('a', '2', 'A Movie', 'PLAN_TO_WATCH', 'MOVIE'),
    ];
    const movies = findWatchTogether(entries, { userIds: ['a'], mediaTypes: ['MOVIE'] });
    expect(movies.map((item) => item.title)).toEqual(['A Movie']);
  });

  it('treats "anything" as no filter', () => {
    const entries = [
      entry('a', '1', 'An Anime', 'PLAN_TO_WATCH', 'ANIME'),
      entry('a', '2', 'A Movie', 'PLAN_TO_WATCH', 'MOVIE'),
    ];
    expect(findWatchTogether(entries, { userIds: ['a'] })).toHaveLength(2);
  });

  it('does not confuse the same id from different providers', () => {
    const entries = [
      entry('a', '1396', 'Anime 1396', 'PLAN_TO_WATCH', 'ANIME'),
      entry('b', '1396', 'Breaking Bad', 'PLAN_TO_WATCH', 'TV'),
    ];
    const results = findWatchTogether(entries, { userIds: ['a', 'b'] });
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.planToWatchCount === 1)).toBe(true);
  });

  it('is deterministic, including tie ordering', () => {
    const entries = [
      entry('a', '1', 'Bravo', 'PLAN_TO_WATCH'),
      entry('a', '2', 'Alpha', 'PLAN_TO_WATCH'),
    ];
    const runs = new Set(
      Array.from({ length: 20 }, () =>
        findWatchTogether(entries, { userIds: ['a', 'b'] })
          .map((item) => item.title)
          .join(','),
      ),
    );
    expect(runs.size).toBe(1);
    // Equal scores fall back to alphabetical order.
    expect([...runs][0]).toBe('Alpha,Bravo');
  });

  it('respects the limit', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry('a', String(index), `Title ${index}`, 'PLAN_TO_WATCH'),
    );
    expect(findWatchTogether(entries, { userIds: ['a'], limit: 5 })).toHaveLength(5);
  });

  it('returns nothing when no users are given', () => {
    expect(findWatchTogether([entry('a', '1', 'X', 'PLAN_TO_WATCH')], { userIds: [] })).toEqual([]);
  });

  it('handles a group where nobody has any entries', () => {
    expect(findWatchTogether([], { userIds: ['a', 'b', 'c'] })).toEqual([]);
  });

  it('produces the documented four-person example', () => {
    // Three of four want it; the fourth has never added it.
    const entries = [
      entry('a', '1', 'Frieren', 'PLAN_TO_WATCH'),
      entry('b', '1', 'Frieren', 'PLAN_TO_WATCH'),
      entry('c', '1', 'Frieren', 'PLAN_TO_WATCH'),
    ];
    const [result] = findWatchTogether(entries, { userIds: ['a', 'b', 'c', 'd'] });
    expect(result?.planToWatchCount).toBe(3);
    expect(result?.unwatchedCount).toBe(1);
    expect(result?.score).toBe(3 * PLAN_TO_WATCH_POINTS + 1 * UNWATCHED_POINTS);
  });
});
