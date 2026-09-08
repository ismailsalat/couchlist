# Couchlist v10.7 — AniList reliability + real provider testing

This update is intentionally small and permanent. It does not add another catalog provider or background service.

## What changed

- All Anime browse now uses the simplest AniList query shape: `format_not: MUSIC` instead of passing a list of enum formats as variables.
- Anime Series and Anime Movies use direct provider enum filters.
- The All browse page gets Trending + Popular Anime in **one** GraphQL request instead of two simultaneous requests.
- AniList uses one bounded retry instead of multiplying a burst/rate-limit failure.
- Long `Retry-After` responses return control to Couchlist quickly rather than freezing a page for up to a minute.
- AniList 429 responses create a short in-process cooldown so multiple open tabs do not keep hammering the same provider.
- Safe provider diagnostics now include HTTP/provider status, retry-after, and remaining-rate-limit values in server logs without logging tokens.
- `/api/health` now tests the actual AniList **browse** path, not merely search.
- Added `npm run test:providers-live`, a real read-only smoke check for AniList search, AniList browse, and TMDB browse.
- Added the live provider smoke check to `MANUAL_TESTING.md` for every future media-provider/browse release.

## Still deliberately simple

- no new dependency
- no database migration
- no second anime provider
- no cron job
- no background worker
- no local mirror of the AniList catalog

AniList can still have a genuine outage. Couchlist now uses fewer requests, preserves stale data where available, cools down on rate limits, and tells us exactly which provider path failed instead of hiding the diagnosis.
