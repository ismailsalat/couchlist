# Couchlist v12.2 — Simple Global Sources Directory

This pass keeps the existing Couchlist architecture and simplifies source discovery and moderation.

## What changed

- `/sources` is still public and does not require Discord login.
- Replaced the busy Global Sources layout with a compact directory: search, filters, sorting, source count, and one clean row per source.
- Added simple Like / Dislike reactions. Existing 1–5 ratings remain compatible; 4–5 count as positive, 1–2 as negative, and 3 is neutral.
- Default public sorting is **Most Liked**, using a confidence-aware score so one vote does not outrank a source with substantial positive feedback.
- Added large source links/touch targets and best-effort site favicons with a clean fallback tile.
- Added a small public source-suggestion form. Suggestions remain pending until an operator reviews them.
- Added operator controls to lower a source's ranking, mark it not working, remove/restore it from the directory, and reset those controls.
- Fixed a major Watch-tab gap: an enabled global source that supports Anime, Movies, or TV now appears as a **general source** for matching titles even when Couchlist does not yet have an exact-title availability row. These rows are explicitly labeled as not confirmed for the exact title.
- Generic source reports now target the source itself rather than pretending there is an exact-title availability record.
- Kept the existing server sharing, ratings, health reports, suggestions, membership refresh, and public directory architecture.

## Migration

`packages/db/migrations/0009_source_directory_controls.sql`

Adds two lightweight operator controls to `watch_sources`:

- `admin_rank_penalty` (0–100)
- `admin_health_override` (`WORKING`, `DEGRADED`, `DOWN`, or null)

## Windows verification

From the Couchlist project root:

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

Check:

- `http://localhost:3000/sources`
- a Movie Watch tab
- a TV Watch tab
- an Anime Watch tab
- `http://localhost:3000/dev/watch-sources`

For `/sources`, also test an incognito/private window to confirm public browsing works without Discord login.
