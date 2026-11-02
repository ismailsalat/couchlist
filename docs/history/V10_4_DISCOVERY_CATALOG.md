# Couchlist v10.4 — discovery catalog clarity

This release fixes a usability problem found by a real tester: the Search page looked like Couchlist only had a handful of titles, even though the search box already reaches the full AniList/TMDB catalog.

## What changed

- Empty Search now says clearly that the shelves are starter picks, not the whole catalog.
- The All tab shows three useful rows: Trending Anime, Movies Right Now, and TV Right Now.
- Anime shows Trending Anime plus Popular Anime.
- Movies shows Movies Right Now plus Top Rated Movies.
- TV Shows shows TV Right Now plus Popular TV Shows.
- Each shelf can show up to 10 compact posters and horizontally scrolls on smaller screens.
- TMDB browse calls are category-specific, so Movies and TV no longer fight for slots in one mixed feed.
- AniList browse uses one GraphQL request for both anime shelves.
- AniList list/search queries now request summary fields only; detail fields are fetched only when a title is opened. This reduces discovery payload size and helps avoid browse timeouts.
- Discovery caches keep the last successful shelf during a temporary provider failure instead of immediately replacing it with an empty row.
- Technical provider wording was replaced with user-facing copy that reminds people Search still covers the full catalog.

## Stability kept

- no new dependency
- no database migration
- no background worker
- no local catalog mirror
- no manual title curation
- no change to tracking, friends, bot, or account behavior

Couchlist still relies on AniList and TMDB as the source of truth. The new shelves only make that existing catalog easier to discover.
