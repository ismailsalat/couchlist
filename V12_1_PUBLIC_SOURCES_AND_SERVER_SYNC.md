# Couchlist v12.1 — Public Sources + Server Sync + Richer Media

## What changed
- Added `/sources`, a public global source directory that does not require Discord login.
- Added Global Sources to the signed-in desktop nav and landing page.
- Server overview title lists now show real poster thumbnails with Anime/Movie/TV fallbacks.
- Server source posts tied to a title now show a compact media-type visual.
- Improved server/source card contrast and documentation-style source browsing.
- Added automatic Discord guild-membership refresh using the existing bot token and exact member REST checks.
- Added a small `Refresh servers` button for immediate join/leave updates without logging out.
- Guild refresh is fail-safe: a Discord outage never clears memberships.
- Fixed a duplicate URL field in the server Share Source form.

## Database
Migration `0008_guild_membership_refresh.sql` adds `users.guilds_synced_at` so Couchlist can rate-limit automatic membership refreshes even for users with zero servers.

## Local validation
Run on Windows from the project root:

```cmd
npm run db:deploy
npm run lint
npm run typecheck
npm run build
npm test
npm audit
```

Then:

```cmd
npm run dev --workspace @couchlist/web
```

Check `/sources`, `/my-server`, and a `/server/<guildId>` page.
