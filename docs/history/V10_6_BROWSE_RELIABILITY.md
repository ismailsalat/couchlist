# Couchlist v10.6 — Browse reliability

This update fixes the Search/Browse flow without adding another service or catalog database.

## What changed

- Category changes now remount the browse grid, so an empty Anime request cannot leave Movies or TV stuck in the old state.
- Long browse loads the next 20 titles automatically with the browser's built-in `IntersectionObserver`.
- Already loaded titles stay on the page when scrolling back up.
- Anime discovery uses one provider-native paged AniList query for Trending, Popular, Top Rated, Home discovery, and Search discovery.
- Anime has a small format filter: All Anime, Series, Movies.
- AniList browse uses the normal provider timeout instead of the shorter TMDB discovery timeout.
- The first degraded page retries once automatically in the browser and keeps any last-good fallback visible while retrying.
- All-page Anime can fall back from Trending to Popular when only one AniList ranking is temporarily unavailable.
- Degraded discovery caches expire quickly so a short provider problem does not leave the catalog empty for minutes.

## Deliberately not added

- no local 500-title catalog
- no background sync worker
- no cron job
- no infinite-scroll package
- no new dependency
- no database migration

The catalog still comes directly from AniList and TMDB and loads only as far as a user actually scrolls.
