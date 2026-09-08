# Couchlist v10.5 — long browse without a local catalog

This update makes discovery feel full without turning Couchlist into a catalog-sync project.

## What users see

- The All tab stays small and clear: Trending Anime, Movies Right Now, and TV Right Now.
- Every shelf has a `See more` link.
- Anime, Movies, and TV tabs become long browse views.
- Each category has three simple rankings: Trending, Popular, and Top Rated.
- Browse loads 20 posters at a time and appends them to the same page.
- A user can keep loading up to 25 pages (500 picks) without downloading 500 posters on first load.
- Copy above discovery explains that starter picks are not the whole catalog and that search can find a specific title.

## Why it stays simple

- no local media catalog database
- no background sync job
- no infinite-scroll library
- no new dependency
- no migration
- one small authenticated `/api/browse` route
- one small client component for the Load More button
- provider-native pagination from AniList and TMDB
- tiny in-process page cache only

The permanent rule stays the same: search is for a title you already have in mind; browse is for finding something when you do not.
