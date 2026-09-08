import { readFileSync, existsSync } from "node:fs";

loadDotEnv();

const timeoutMs = Math.min(
  Math.max(Number.parseInt(process.env.PROVIDER_TIMEOUT_MS ?? "8000", 10) || 8000, 3000),
  10000,
);
const anilistUrl = process.env.ANILIST_API_URL || "https://graphql.anilist.co";
const jikanBase = (process.env.JIKAN_API_BASE_URL || "https://api.jikan.moe/v4").replace(/\/$/, "");
const kitsuBase = (process.env.KITSU_API_BASE_URL || "https://kitsu.io/api/edge").replace(/\/$/, "");
const tmdbBase = (process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3").replace(/\/$/, "");
const tmdbKey = (process.env.TMDB_API_KEY || "").trim();

const checks = [];
const anilistSearch = await checkAniListSearch();
const anilistBrowse = await checkAniListBrowse();
const jikanSearch = await checkJikanSearch();
const jikanBrowse = await checkJikanBrowse();
const kitsuSearch = await checkKitsuSearch();
const kitsuBrowse = await checkKitsuBrowse();
const tmdbBrowse = await checkTmdbTrending();
checks.push(
  anilistSearch,
  anilistBrowse,
  jikanSearch,
  jikanBrowse,
  kitsuSearch,
  kitsuBrowse,
  tmdbBrowse,
);

const animeSearchHealthy = [anilistSearch, jikanSearch, kitsuSearch].filter((check) => check.ok).length;
const animeBrowseHealthy = [anilistBrowse, jikanBrowse, kitsuBrowse].filter((check) => check.ok).length;
const summaryChecks = [
  {
    name: "Anime search redundancy",
    ok: animeSearchHealthy > 0,
    detail: `${animeSearchHealthy}/3 providers healthy`,
  },
  {
    name: "Anime browse redundancy",
    ok: animeBrowseHealthy > 0,
    detail: `${animeBrowseHealthy}/3 providers healthy`,
  },
];

console.log("\nProvider smoke summary");
for (const check of checks) printCheck(check);
console.log("");
for (const check of summaryChecks) printCheck(check);

const tmdbFailed = !tmdbBrowse.ok && !tmdbBrowse.skipped;
if (summaryChecks.some((check) => !check.ok) || tmdbFailed) process.exitCode = 1;

function printCheck(check) {
  const prefix = check.ok ? "PASS" : check.skipped ? "SKIP" : "FAIL";
  console.log(`${prefix.padEnd(4)}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
}

async function checkAniListSearch() {
  return postAniList(
    "AniList search",
    `query ($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { id }
      }
    }`,
    { search: "One Piece", perPage: 1 },
    (payload) => Array.isArray(payload?.data?.Page?.media),
  );
}

async function checkAniListBrowse() {
  return postAniList(
    "AniList browse",
    `query ($page: Int!, $perPage: Int!) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, format_not: MUSIC, isAdult: false) { id }
      }
    }`,
    { page: 1, perPage: 1 },
    (payload) => Array.isArray(payload?.data?.Page?.media),
  );
}

async function postAniList(name, query, variables, validate) {
  try {
    const response = await fetchWithTimeout(anilistUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await safeJson(response);
    return { name, ok: response.ok && validate(payload), detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, ok: false, detail: errorLabel(error) };
  }
}

async function checkJikanSearch() {
  const url = new URL(`${jikanBase}/anime`);
  url.searchParams.set("q", "One Piece");
  url.searchParams.set("limit", "1");
  url.searchParams.set("sfw", "true");
  return getJsonArray("Jikan search", url, "data");
}

async function checkJikanBrowse() {
  const url = new URL(`${jikanBase}/top/anime`);
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("filter", "bypopularity");
  url.searchParams.set("sfw", "true");
  return getJsonArray("Jikan browse", url, "data");
}

async function checkKitsuSearch() {
  const url = new URL(`${kitsuBase}/anime`);
  url.searchParams.set("filter[text]", "One Piece");
  url.searchParams.set("page[limit]", "1");
  return getJsonArray("Kitsu search", url, "data", {
    accept: "application/vnd.api+json",
  });
}

async function checkKitsuBrowse() {
  const url = new URL(`${kitsuBase}/anime`);
  url.searchParams.set("sort", "popularityRank");
  url.searchParams.set("page[limit]", "1");
  return getJsonArray("Kitsu browse", url, "data", {
    accept: "application/vnd.api+json",
  });
}

async function getJsonArray(name, url, key, headers = { accept: "application/json" }) {
  try {
    const response = await fetchWithTimeout(url, { headers });
    const payload = await safeJson(response);
    return {
      name,
      ok: response.ok && Array.isArray(payload?.[key]),
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { name, ok: false, detail: errorLabel(error) };
  }
}

async function checkTmdbTrending() {
  if (!tmdbKey) {
    return { name: "TMDB browse", ok: false, skipped: true, detail: "TMDB_API_KEY not configured" };
  }

  const url = new URL(`${tmdbBase}/trending/movie/day`);
  url.searchParams.set("language", "en-US");
  const headers = { accept: "application/json" };
  if (tmdbKey.includes(".")) headers.authorization = `Bearer ${tmdbKey}`;
  else url.searchParams.set("api_key", tmdbKey);

  try {
    const response = await fetchWithTimeout(url, { headers });
    const payload = await safeJson(response);
    return {
      name: "TMDB browse",
      ok: response.ok && Array.isArray(payload?.results),
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { name: "TMDB browse", ok: false, detail: errorLabel(error) };
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorLabel(error) {
  if (error instanceof Error && error.name === "AbortError") return `timeout after ${timeoutMs}ms`;
  return error instanceof Error ? error.name : "unknown error";
}

function loadDotEnv() {
  if (!existsSync(".env")) return;
  const raw = readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
