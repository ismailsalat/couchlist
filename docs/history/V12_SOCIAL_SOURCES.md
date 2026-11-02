# Couchlist v12 — Social Sources

This update keeps Couchlist centered on friends and Discord servers while making Watch Sources easier to manage.

## Added

- **My Server** in the main navigation and a server picker at `/my-server`.
- Server hub tabs: **Overview**, **Members**, and **Sources**.
- Server-scoped source sharing with optional title and comment.
- Global and per-server 1–5 star ratings with weighted ranking.
- **Works for me** / **Not working** reliability votes with 7-day health signals.
- Health states: Healthy, Some issues, Degraded, and Possibly unavailable.
- Simple reports that never auto-delete a source.
- `/dev/watch-sources` tabs for Sources, Suggestions, Reports, and Advanced imports.
- Quick Add so one-off sources do not require JSON.
- Anime / Movies / TV support tags and stronger source-card contrast.
- Red popcorn bucket + yellow popcorn Couchlist branding.
- Discord `/watch suggest` for server shares or Couchlist review suggestions.

## Windows update / test

From the Couchlist folder:

```cmd
npm install
npm run db:deploy
npm run bot:register
npm run lint
npm run typecheck
npm run build
npm test
npm audit
npm run test:providers-live
```

Then start the web app:

```cmd
npm run dev --workspace @couchlist/web
```

Open `http://localhost:3000`. The Watch Sources developer area remains `/dev/watch-sources` and is still gated by the existing `BOT_OWNER_IDS` allowlist.

## Data model

The existing `watch_sources`, `media_watch_sources`, `watch_source_candidates`, and `watch_source_reports` systems are reused. Migration `0007_watch_social.sql` adds only the social pieces required for server source posts, ratings, and health votes.
