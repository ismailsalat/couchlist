# Couchlist v12.5 — Catalog-first UI

This release moves Couchlist away from a streaming-service/landing-page feel and toward a modern social catalog / directory.

## What changed

- Home is now a compact catalog dashboard instead of a large cinematic hero.
- The top of Home shows library counts for Watching, Plan to Watch, and Completed.
- Desktop navigation now includes a clear Browse destination and uses simpler naming.
- Mobile top navigation is consistent across Home, Friends, Server, Profile, Pick Together, Search, media pages, Compare, and admin pages.
- Mobile bottom navigation now shows an active destination state on every page.
- Global Sources is framed as a community Source Directory rather than a streaming destination.
- Source results are visually separated into compact directory records so adjacent sources do not blend together.
- Friends copy and layout language is simplified to emphasize people, taste, and activity.
- Global page background is quieter: dark navy/charcoal with subtle catalog-style depth. Posters and content provide most of the color.
- Existing source voting, safety notice, reports, server sharing, auth, database, and provider behavior are unchanged.

## Future expansion

The UI is intentionally category-neutral enough to add Manga, Manhwa, and Comics later without another full redesign. No reading categories are added in this release.

## Database

No migration is required.

## About version

The default `COUCHLIST_ABOUT_VERSION` is now `12.5.0`. Existing Railway/local environment values still override the default, so update that variable manually if you want `/about` to display v12.5.0.

## Windows validation

```cmd
cd "C:\Users\caano\Documents\couchlist"

npm run lint
npm run typecheck
npm run build
npm test
npm audit
```

Then run the site:

```cmd
npm run dev --workspace @couchlist/web
```
