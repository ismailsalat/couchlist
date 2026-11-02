# Couchlist v10.3 — compact discovery + community polish

This release keeps the stable v10.2 architecture and only changes presentation / existing read paths.

## Community hub
- Connected server pages are now a compact community hub instead of long table-like lists.
- The server hero shows its real Discord icon, member count, and a few simple community stats.
- Watching, top rated, and want-to-watch are shown as three small pulse cards with poster thumbnails.
- People who currently have something in `Watching` are surfaced first in the member section.
- `Watching` is **not** renamed to `Live`. True live presence stays reserved for a future active Watch Party signal so Couchlist never fakes presence.
- Duplicate long tally sections were removed.

## Home
- The cozy hero is shorter on desktop and mobile.
- New-user help is now one compact strip: Search → Save → Add a friend.
- It still disappears naturally after the first tracked title; there is no onboarding state to maintain.

## Search / discovery
- An empty search page is no longer an empty box. It shows compact Anime, Movies, and TV Shows shelves from the existing global discovery feed.
- Search still works exactly the same after a query is entered.
- No new provider, database table, cron job, or recommendation engine was added.

## Mobile PWA
- The bottom navigation keeps its large iOS-safe touch targets.
- Its reserved page space now matches the real nav height more closely so there is not a visible dead gap above it.
- The nav background is opaque and visually attached to the page while scrolling.

## Stability
- No database migration.
- No new dependency.
- No background service.
- No new client state library.
- No fake live-presence system.
- `package-lock.json` remains intentionally excluded from update ZIPs so a verified local lockfile is not overwritten.
