import { afterEach, describe, expect, it, vi } from "vitest";
import { AniListClient, AppError, JikanClient, KitsuClient, TmdbClient } from "@couchlist/shared";
import {
  aniListSearchFixture,
  tmdbSearchFixture,
  tmdbMovieFixture,
} from "../helpers/fixtures";

/**
 * Provider adapters.
 *
 * The sandbox cannot reach AniList or TMDB, so `fetch` is stubbed with recorded
 * response shapes. The adapters themselves are the real production code paths.
 */
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stubJson(payload: unknown, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("AniList adapter", () => {
  const client = new AniListClient({ apiUrl: "https://graphql.anilist.co" });

  it("maps a search response to media summaries", async () => {
    stubJson(aniListSearchFixture);
    const results = await client.search("attack on titan");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      provider: "ANILIST",
      mediaType: "ANIME",
      providerMediaId: "16498",
      canonicalMediaKey: "mal:16498",
      title: "Attack on Titan",
      year: 2013,
      episodeCount: 25,
    });
  });

  it("loads global anime trending with the simple all-anime query", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(aniListSearchFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const results = await client.trending(2);
    expect(results).toHaveLength(2);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      query: string;
      variables: { page: number; perPage: number };
    };
    expect(body.query).toContain("sort: TRENDING_DESC");
    expect(body.query).toContain("format_not: MUSIC");
    expect(body.query).not.toContain("format_in: $formats");
    expect(body.variables).toEqual({ page: 1, perPage: 2 });
  });

  it("loads both anime starter shelves in one GraphQL request", async () => {
    const media = aniListSearchFixture.data.Page.media;
    const spy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              trending: { media },
              popular: { media },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await client.browse(2);
    expect(result.trending).toHaveLength(2);
    expect(result.popular).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      query: string;
      variables: { perPage: number };
    };
    expect(body.query).toContain("trending: Page");
    expect(body.query).toContain("popular: Page");
    expect(body.query).toContain("TRENDING_DESC");
    expect(body.query).toContain("POPULARITY_DESC");
    expect(body.query).not.toContain("description(asHtml: false)");
    expect(body.variables.perPage).toBe(2);
  });

  it("pages through anime browse rankings without enum-array variables", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(aniListSearchFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const results = await client.browsePage("top-rated", 3, 20);
    expect(results).toHaveLength(2);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      query: string;
      variables: { page: number; perPage: number };
    };
    expect(body.variables).toEqual({ page: 3, perPage: 20 });
    expect(body.query).toContain("sort: SCORE_DESC");
    expect(body.query).toContain("format_not: MUSIC");
    expect(body.query).not.toContain("$sort");
    expect(body.query).not.toContain("$formats");
  });

  it("separates anime series and anime movies with direct query filters", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(aniListSearchFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await client.browsePage("popular", 1, 20, "series");
    await client.browsePage("popular", 1, 20, "movies");

    const first = JSON.parse(
      String((spy.mock.calls[0]?.[1] as RequestInit).body),
    ) as { query: string };
    const second = JSON.parse(
      String((spy.mock.calls[1]?.[1] as RequestInit).body),
    ) as { query: string };

    expect(first.query).toContain(
      "format_in: [TV, TV_SHORT, OVA, ONA, SPECIAL]",
    );
    expect(first.query).not.toContain("format: MOVIE");
    expect(second.query).toContain("format: MOVIE");
    expect(second.query).not.toContain("format_in:");
  });

  it("surfaces AniList rate-limit metadata without waiting a full Retry-After", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: "Too Many Requests" }] }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "30",
            "x-ratelimit-limit": "30",
            "x-ratelimit-remaining": "0",
          },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const started = Date.now();
    await expect(client.browsePage("trending", 1, 20)).rejects.toMatchObject({
      code: "CL_MEDIA_PROVIDER_ERROR",
      context: {
        status: 429,
        retryAfterSeconds: 30,
        rateLimitLimit: 30,
        rateLimitRemaining: 0,
      },
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("turns a GraphQL response without data into a provider error", async () => {
    stubJson({ errors: [{ message: "temporary" }] });
    await expect(client.browsePage("trending", 1, 20)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("prefers the English title but falls back", async () => {
    stubJson({
      data: {
        Page: {
          media: [
            {
              id: 1,
              title: { romaji: "Romaji Only", english: null, native: null },
              seasonYear: 2020,
              episodes: 12,
              status: "FINISHED",
              description: null,
              genres: [],
              bannerImage: null,
              coverImage: null,
              source: null,
              studios: { nodes: [] },
            },
          ],
        },
      },
    });
    const [result] = await client.search("x");
    expect(result?.title).toBe("Romaji Only");
  });

  it("strips HTML from descriptions", async () => {
    stubJson({
      data: {
        Media: {
          id: 16498,
          title: { romaji: null, english: "Test", native: null },
          seasonYear: 2013,
          episodes: 25,
          status: "FINISHED",
          description: "Line one.<br><br><i>Italic</i> text.",
          genres: ["Action"],
          bannerImage: null,
          coverImage: { large: null, extraLarge: null },
          source: "MANGA",
          studios: { nodes: [{ name: "WIT Studio" }] },
        },
      },
    });

    const detail = await client.byId("16498");
    expect(detail?.description).not.toContain("<");
    expect(detail?.studio).toBe("WIT Studio");
    expect(detail?.source).toBe("Manga");
  });

  it("returns null for a non-numeric id rather than calling out", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    expect(await client.byId("not-a-number")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("raises a provider error when AniList fails", async () => {
    stubJson({ errors: [{ message: "boom" }] }, 500);
    await expect(client.search("x")).rejects.toBeInstanceOf(AppError);
  });

  it("times out rather than hanging", async () => {
    globalThis.fetch = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    ) as unknown as typeof fetch;

    const impatient = new AniListClient({
      apiUrl: "https://graphql.anilist.co",
      timeoutMs: 20,
    });
    await expect(impatient.search("x")).rejects.toMatchObject({
      code: "CL_MEDIA_PROVIDER_TIMEOUT",
    });
  }, 10_000);
});


describe("Jikan adapter", () => {
  const client = new JikanClient({ baseUrl: "https://api.jikan.moe/v4" });

  const anime = {
    mal_id: 5114,
    title: "Fullmetal Alchemist: Brotherhood",
    title_english: "Fullmetal Alchemist: Brotherhood",
    year: 2009,
    episodes: 64,
    type: "TV",
    status: "Finished Airing",
    synopsis: "Two brothers search for a way to restore what they lost.",
    source: "Manga",
    images: {
      jpg: {
        image_url: "https://cdn.myanimelist.net/images/anime/1223/96541.jpg",
        large_image_url: "https://cdn.myanimelist.net/images/anime/1223/96541l.jpg",
      },
    },
    trailer: { images: { maximum_image_url: "https://example.com/banner.jpg" } },
    genres: [{ name: "Action" }, { name: "Adventure" }],
    studios: [{ name: "Bones" }],
  };

  it("maps anime search results to Jikan media identities", async () => {
    stubJson({ data: [anime], pagination: { has_next_page: false } });

    const [result] = await client.search("fullmetal", 8);
    expect(result).toMatchObject({
      provider: "JIKAN",
      mediaType: "ANIME",
      providerMediaId: "5114",
      canonicalMediaKey: "mal:5114",
      title: "Fullmetal Alchemist: Brotherhood",
      year: 2009,
      episodeCount: 64,
    });
  });

  it("uses provider-native ranking filters for Anime browse", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [anime], pagination: { has_next_page: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const page = await client.browsePage("popular", 2, 20, "movies");
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);

    const url = new URL(String(spy.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v4/top/anime");
    expect(url.searchParams.get("filter")).toBe("bypopularity");
    expect(url.searchParams.get("type")).toBe("movie");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("sfw")).toBe("true");
  });

  it("loads title detail without AniList", async () => {
    stubJson({ data: anime });
    const detail = await client.byId("5114");

    expect(detail).toMatchObject({
      provider: "JIKAN",
      providerMediaId: "5114",
      studio: "Bones",
      source: "Manga",
      genres: ["Action", "Adventure"],
    });
  });

  it("rejects a failed Jikan request as a provider error", async () => {
    stubJson({ message: "Service unavailable" }, 503);
    await expect(client.search("x")).rejects.toBeInstanceOf(AppError);
  });
});

describe("Kitsu adapter", () => {
  const client = new KitsuClient({ baseUrl: "https://kitsu.io/api/edge" });

  const anime = {
    id: "1",
    type: "anime",
    attributes: {
      canonicalTitle: "Cowboy Bebop",
      titles: { en: "Cowboy Bebop", en_jp: "Cowboy Bebop", ja_jp: "カウボーイビバップ" },
      synopsis: "Bounty hunters travel the solar system.",
      posterImage: { large: "https://media.kitsu.app/anime/poster_images/1/large.jpg" },
      coverImage: { large: "https://media.kitsu.app/anime/1/cover_image/large.jpg" },
      startDate: "1998-04-03",
      status: "finished",
      subtype: "TV",
      episodeCount: 26,
      nsfw: false,
    },
    relationships: {
      categories: { data: [{ id: "1", type: "categories" }] },
      mappings: { data: [{ id: "map-mal-1", type: "mappings" }] },
    },
  };

  const malMapping = {
    id: "map-mal-1",
    type: "mappings",
    attributes: { externalSite: "myanimelist/anime", externalId: "1" },
  };

  it("maps public anime search results to Kitsu identities", async () => {
    stubJson({ data: [anime], included: [malMapping], links: { next: null } });
    const [result] = await client.search("cowboy bebop", 8);

    expect(result).toMatchObject({
      provider: "KITSU",
      mediaType: "ANIME",
      providerMediaId: "1",
      canonicalMediaKey: "mal:1",
      title: "Cowboy Bebop",
      year: 1998,
      episodeCount: 26,
    });
  });

  it("uses Kitsu ranking and subtype filters for fallback browse", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [anime], included: [malMapping], links: { next: "https://next" } }), {
          status: 200,
          headers: { "content-type": "application/vnd.api+json" },
        }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const page = await client.browsePage("top-rated", 2, 20, "movies");
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);

    const url = new URL(String(spy.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/edge/anime");
    expect(url.searchParams.get("sort")).toBe("ratingRank");
    expect(url.searchParams.get("filter[subtype]")).toBe("movie");
    expect(url.searchParams.get("page[limit]")).toBe("20");
    expect(url.searchParams.get("page[offset]")).toBe("20");
    expect(url.searchParams.get("include")).toBe("mappings");
  });

  it("loads Kitsu detail and included categories", async () => {
    stubJson({
      data: anime,
      included: [
        { id: "1", type: "categories", attributes: { title: "Action" } },
        malMapping,
      ],
    });

    const detail = await client.byId("1");
    expect(detail).toMatchObject({
      provider: "KITSU",
      providerMediaId: "1",
      title: "Cowboy Bebop",
      genres: ["Action"],
      status: "Finished",
      canonicalMediaKey: "mal:1",
    });
  });

  it("cross-references an AniList id through Kitsu mappings", async () => {
    const spy = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("/mappings")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "map-anilist-1",
                type: "mappings",
                attributes: { externalSite: "anilist/anime", externalId: "1" },
                relationships: { item: { data: { id: "1", type: "anime" } } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/vnd.api+json" } },
        );
      }
      return new Response(
        JSON.stringify({ data: anime, included: [malMapping] }),
        { status: 200, headers: { "content-type": "application/vnd.api+json" } },
      );
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const detail = await client.byAniListId("1");
    expect(detail?.canonicalMediaKey).toBe("mal:1");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("returns null for an invalid Kitsu id", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    expect(await client.byId("bad-id")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("TMDB adapter", () => {
  const client = new TmdbClient({
    apiKey: "test-key",
    baseUrl: "https://api.themoviedb.org/3",
  });

  it("maps movies and TV and drops people", async () => {
    stubJson(tmdbSearchFixture);
    const results = await client.search("attack");

    expect(results.map((item) => item.mediaType)).toEqual(["MOVIE", "TV"]);
    expect(results[0]).toMatchObject({
      provider: "TMDB",
      providerMediaId: "157336",
      title: "Attack the Block",
      year: 2011,
    });
  });

  it("loads global movie and TV trending and drops people", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(tmdbSearchFixture), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const results = await client.trending(8);
    expect(results.map((item) => item.mediaType)).toEqual(["MOVIE", "TV"]);

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/trending/all/day");
  });


  it("loads and pages category-specific movie and TV browse lists", async () => {
    const movieResults = tmdbSearchFixture.results.filter(
      (item) => item.media_type === "movie",
    );
    const tvResults = tmdbSearchFixture.results.filter(
      (item) => item.media_type === "tv",
    );

    const spy = vi.fn(async (url: string | URL) => {
      const value = String(url);
      const results = value.includes("/tv/") ? tvResults : movieResults;
      return new Response(JSON.stringify({ results }), { status: 200 });
    });
    globalThis.fetch = spy as unknown as typeof fetch;

    const [moviesNow, moviesPopular, moviesTop, tvNow, tvPopular, tvTop] =
      await Promise.all([
        client.trendingMovies(5, 2),
        client.popularMovies(5, 2),
        client.topRatedMovies(5, 2),
        client.trendingTv(5, 2),
        client.popularTv(5, 2),
        client.topRatedTv(5, 2),
      ]);

    expect(moviesNow.every((item) => item.mediaType === "MOVIE")).toBe(true);
    expect(moviesPopular.every((item) => item.mediaType === "MOVIE")).toBe(true);
    expect(moviesTop.every((item) => item.mediaType === "MOVIE")).toBe(true);
    expect(tvNow.every((item) => item.mediaType === "TV")).toBe(true);
    expect(tvPopular.every((item) => item.mediaType === "TV")).toBe(true);
    expect(tvTop.every((item) => item.mediaType === "TV")).toBe(true);

    const urls = spy.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/trending/movie/day"))).toBe(true);
    expect(urls.some((url) => url.includes("/movie/popular"))).toBe(true);
    expect(urls.some((url) => url.includes("/movie/top_rated"))).toBe(true);
    expect(urls.some((url) => url.includes("/trending/tv/day"))).toBe(true);
    expect(urls.some((url) => url.includes("/tv/popular"))).toBe(true);
    expect(urls.some((url) => url.includes("/tv/top_rated"))).toBe(true);
    expect(urls.every((url) => new URL(url).searchParams.get("page") === "2")).toBe(true);
  });

  it("maps movie detail", async () => {
    stubJson(tmdbMovieFixture);
    const detail = await client.byId("157336", "MOVIE");
    expect(detail).toMatchObject({
      runtimeMinutes: 88,
      genres: ["Science Fiction"],
    });
  });

  it("represents TMDB watch providers as one honest JustWatch chooser", async () => {
    stubJson({
      id: 157336,
      results: {
        US: {
          link: "https://www.justwatch.com/us/movie/attack-the-block",
          flatrate: [
            { provider_id: 8, provider_name: "Netflix" },
            { provider_id: 9, provider_name: "Prime Video" },
          ],
          rent: [{ provider_id: 9, provider_name: "Prime Video" }],
          buy: [{ provider_id: 2, provider_name: "Apple TV" }],
        },
      },
    });

    const links = await client.watchProviders("157336", "MOVIE");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      sourceName: "JustWatch",
      url: "https://www.justwatch.com/us/movie/attack-the-block",
      accessType: "UNKNOWN",
      metadata: { attribution: "justwatch" },
    });
    expect(links[0]?.metadata?.providerOptions).toEqual([
      { name: "Netflix", accessTypes: ["SUBSCRIPTION"] },
      { name: "Prime Video", accessTypes: ["SUBSCRIPTION", "RENT"] },
      { name: "Apple TV", accessTypes: ["BUY"] },
    ]);
  });

  it("never puts the api key in the url when a bearer token is used", async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify(tmdbSearchFixture), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const v4 = new TmdbClient({
      apiKey: "header.token.value",
      baseUrl: "https://api.themoviedb.org/3",
    });
    await v4.search("x");

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("header.token.value");
    expect((init.headers as Record<string, string>).authorization).toContain(
      "Bearer",
    );
  });

  it("returns nothing when no api key is configured", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const unconfigured = new TmdbClient({
      apiKey: "",
      baseUrl: "https://api.themoviedb.org/3",
    });
    expect(unconfigured.configured).toBe(false);
    expect(await unconfigured.search("x")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric id without calling out", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    expect(await client.byId("../../secrets", "MOVIE")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("surfaces a provider error on failure", async () => {
    stubJson({ status_message: "nope" }, 502);
    await expect(client.search("x")).rejects.toMatchObject({
      code: "CL_MEDIA_PROVIDER_ERROR",
    });
  });
});
