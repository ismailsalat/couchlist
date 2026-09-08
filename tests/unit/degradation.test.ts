import { afterEach, describe, expect, it, vi } from 'vitest';
import { AniListClient, TmdbClient } from '@couchlist/shared';
import { aniListSearchFixture, tmdbSearchFixture } from '../helpers/fixtures';

/**
 * Graceful degradation.
 *
 * One provider being unreachable must never take the other down, and must
 * never surface as an unhandled rejection.
 */
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const anilist = new AniListClient({ apiUrl: 'https://graphql.anilist.co', timeoutMs: 300 });
const tmdb = new TmdbClient({
  apiKey: 'key',
  baseUrl: 'https://api.themoviedb.org/3',
  timeoutMs: 300,
});

describe('provider outages', () => {
  it('turns a total network failure into a handled error, not a crash', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const [a, t] = await Promise.allSettled([anilist.search('x'), tmdb.search('x')]);

    expect(a.status).toBe('rejected');
    expect(t.status).toBe('rejected');
    expect((a as PromiseRejectedResult).reason).toMatchObject({
      code: 'CL_MEDIA_PROVIDER_ERROR',
    });
  });

  it('keeps anime search working while TMDB is down', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('themoviedb')) throw new Error('tmdb down');
      return new Response(JSON.stringify(aniListSearchFixture), { status: 200 });
    }) as unknown as typeof fetch;

    const [anime, movies] = await Promise.allSettled([anilist.search('x'), tmdb.search('x')]);

    expect(anime.status).toBe('fulfilled');
    expect((anime as PromiseFulfilledResult<unknown[]>).value).toHaveLength(2);
    expect(movies.status).toBe('rejected');
  });

  it('keeps movie search working while AniList is down', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('anilist')) throw new Error('anilist down');
      return new Response(JSON.stringify(tmdbSearchFixture), { status: 200 });
    }) as unknown as typeof fetch;

    const [anime, movies] = await Promise.allSettled([anilist.search('x'), tmdb.search('x')]);

    expect(anime.status).toBe('rejected');
    expect(movies.status).toBe('fulfilled');
    expect((movies as PromiseFulfilledResult<unknown[]>).value.length).toBeGreaterThan(0);
  });

  it('does not multiply a transient Anime provider failure', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('{}', { status: 503 });
    }) as unknown as typeof fetch;

    await expect(anilist.search('x')).rejects.toMatchObject({
      code: 'CL_MEDIA_PROVIDER_ERROR',
    });
    expect(calls).toBe(1);
  });
});
