import { afterEach, describe, expect, it, vi } from "vitest";
import { AniListClient, AppError, TmdbClient } from "@couchlist/shared";
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
      title: "Attack on Titan",
      year: 2013,
      episodeCount: 25,
    });
  });

  it("loads global anime trending without a search term", async () => {
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
      variables: { perPage: number };
    };
    expect(body.query).toContain("TRENDING_DESC");
    expect(body.variables.perPage).toBe(2);
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

  it("maps movie detail", async () => {
    stubJson(tmdbMovieFixture);
    const detail = await client.byId("157336", "MOVIE");
    expect(detail).toMatchObject({
      runtimeMinutes: 88,
      genres: ["Science Fiction"],
    });
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
