# Couchlist v11 — Canonical Anime Identity

Couchlist still uses **one Anime provider at a time** with failover:

- Search: AniList → Jikan → Kitsu
- Trending: AniList → Jikan → Kitsu
- Popular / Top Rated: Jikan → AniList → Kitsu

The important change is that the provider id no longer defines whether two Anime entries are the same title.

## Canonical identity

Anime is cross-referenced to a stable MyAnimeList-backed key such as `mal:21`.

- Jikan is MAL-native, so its id is already the canonical MAL id.
- AniList exposes `idMal`.
- Kitsu exposes MyAnimeList and AniList mappings.

`ANILIST:30013`, `JIKAN:21`, and a Kitsu id can therefore all resolve to `mal:21` and represent one Couchlist title.

## What this fixes

- `All` search no longer shows the same 1999 Anime once as Anime and again as TMDB TV when title + year match.
- A live-action remake with a different year is kept.
- A user cannot create separate saved-list copies of the same canonical Anime through different providers.
- Server counts, friend popularity, taste comparison, and Watch Together can group canonical Anime across providers.
- Browse infinite scroll dedupes by canonical Anime key if the fallback provider changes between pages.
- Old Anime rows are reconciled lazily when profiles, servers, Home, comparisons, list APIs, or Watch Together are opened.

## Lazy migration / request budget

There is no bulk provider-sync job.

Each page only examines a small recent slice of unresolved Anime. Learned aliases and Jikan identities are database-only. At most four previously unknown provider identities are allowed to perform network resolution per page, with at most two concurrent resolutions.

Aliases are stored in `anime_aliases`, so once Couchlist learns a mapping it does not need to ask the provider again.

If AniList is down, Kitsu can cross-reference an old AniList id through Kitsu mappings and still discover the MAL key.

## Duplicate merge rules

When old rows resolve to the same canonical Anime:

- highest episode progress wins;
- newest non-empty rating wins;
- status follows the most recently updated row;
- oldest creation time is preserved;
- newest update time is preserved;
- one row survives.

## Database migration

Run:

```cmd
npm run db:deploy
```

Migration `0004_canonical_anime_identity.sql` adds:

- `media_entries.canonical_media_key`
- a partial unique index on `(user_id, canonical_media_key)`
- `anime_aliases` for persistent provider cross-references

## Local verification

```cmd
npm run db:deploy
npm run lint
npm run typecheck
npm run build
npm test
npm audit
npm run test:providers-live
npm run dev:web
```

Then search `One Piece` under **All** and verify:

- the 1999 Anime appears once;
- the 2023 live-action TV show still appears;
- adding the Anime through one provider still shows the same saved entry if another provider becomes active.
