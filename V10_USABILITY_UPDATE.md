# Couchlist v10 — Usability Update

This release keeps the v9.6 stable core and focuses on making Couchlist easier to understand without adding a large framework, new database tables, or background workers.

## Fixed

- Status buttons on title pages no longer trigger a full `router.refresh()` after every save.
- Watching / Completed / Plan to Watch now update locally after the API confirms the change.
- Save state always clears in `finally`, including network errors.
- Status text explicitly says it can be changed at any time.
- Episode progress gets simple client-side range checks before the API call.

## New-user Home

When a user has no tracked titles, Home shows a small three-step guide:

1. Search a title.
2. Save it as Watching, Completed, or Plan to Watch.
3. Add a friend when ready.

There is no onboarding database state and no dismiss/update system to maintain. The guide disappears naturally after the first tracked title.

## Global discovery

Home now has a small `Trending Right Now` shelf:

- Anime from AniList's trending sort.
- Movies and TV from TMDB's daily trending endpoint.
- Both providers fail independently; one outage does not break Home.
- Discovery requests use a short timeout so a provider cannot hold the Home page for long.
- Results use a tiny in-process cache. This is only an optimization; Couchlist still works if the process restarts.

## Discord community clarity

- Connected Server Taste cards now show the Discord server icon.
- Community Server cards keep the server icon, Couchlist member count, clearer explanation, and small poster-backed lists.
- Labels now say `Watching in this server` and `Want to watch next` instead of implying a ranking algorithm that does not exist yet.
- Server images use lazy/async loading to avoid unnecessary eager resource work in development.

## Stability rules kept

- No database migration.
- No new dependency.
- No background job.
- No new state library.
- No router-wide refresh for a simple status click.
- Existing Discord login, friend system, Watch Together, bot, and Railway setup are unchanged.
