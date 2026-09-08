# Couchlist v10.9 — Multi-provider Anime reliability

Anime discovery no longer depends on a single upstream API. Couchlist now keeps AniList, Jikan/MyAnimeList, and Kitsu available behind ordered fallback chains while Movies/TV remain on TMDB.

## Provider strategy

- Search: AniList → Jikan → Kitsu.
- Trending: AniList → Jikan → Kitsu.
- Popular / Top rated: Jikan → AniList → Kitsu.
- Title detail: use the provider identity attached to the selected result.
- Discord `/watch`: AniList → Jikan → Kitsu for Anime, alongside TMDB.

Only one Anime provider supplies a result page at a time. Couchlist does not merge all three catalogs into one grid, which avoids duplicate copies of the same title with different provider IDs.

## Failure behavior

- A failed Anime provider is put on a short in-process cooldown and skipped temporarily.
- 403 and 429 responses use a longer cooldown than ordinary provider failures.
- Anime provider requests use bounded timeouts and no same-provider retry loop; Couchlist fails over to the next catalog instead.
- Existing successful browse data is still preferred over an empty degraded page.
- `/api/health` reports AniList, Jikan, Kitsu, and TMDB separately.
- `npm run test:providers-live` reports every provider plus aggregate Anime search/browse redundancy. Individual Anime providers may be degraded while the overall Anime system still passes.

## Database

Kitsu has a first-class media identity so a Kitsu fallback result can be saved, rated, compared, and opened normally.

Run:

```bash
npm run db:deploy
```

This applies `0003_kitsu_anime_provider.sql` and adds `KITSU` to the PostgreSQL `media_provider` enum.

## Configuration

No Anime API key is required. Defaults:

- `ANILIST_API_URL=https://graphql.anilist.co`
- `JIKAN_API_BASE_URL=https://api.jikan.moe/v4`
- `KITSU_API_BASE_URL=https://kitsu.io/api/edge`
