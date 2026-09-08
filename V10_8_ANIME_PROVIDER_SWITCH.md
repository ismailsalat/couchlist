# Couchlist v10.8 — Anime catalog provider switch

AniList was returning HTTP 403 for both search and browse in the real provider smoke test while TMDB remained healthy. AniList documents 403 as a possible temporary API suspension, so retries cannot make that condition reliable for Couchlist users.

## What changed

- Anime search, browse, starter shelves, title details, health checks, and `/watch` now use Jikan's public MyAnimeList catalog API.
- Movies and TV remain on TMDB with no behavior change.
- AniList remains in the codebase only so existing `/media/anilist/anime/...` links and previously saved AniList identities can still resolve whenever AniList itself is available.
- Added a first-class `JIKAN` media provider identity instead of storing MyAnimeList ids inside the AniList namespace.
- Added the PostgreSQL enum migration `0002_jikan_anime_provider.sql`.
- `npm run test:providers-live` now checks the providers users actually depend on: Jikan search, Jikan browse, and TMDB browse.
- Added Jikan provider unit coverage for search mapping, browse filters/pagination, details, and failures.

## Deployment

Run the normal database deploy/migration command before starting the updated services:

```bash
npm run db:deploy
```

No Jikan API key is required. `JIKAN_API_BASE_URL` defaults to `https://api.jikan.moe/v4`.
