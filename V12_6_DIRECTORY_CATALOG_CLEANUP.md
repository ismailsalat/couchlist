# Couchlist v12.6 — Directory + Catalog Cleanup

This pass separates Couchlist's three main surfaces so they no longer feel duplicated:

- **Home** is the social dashboard. It now owns the prominent title search and keeps library/friend/server activity.
- **Catalog** (`/search`) is a dense database/index. The default view uses compact ranked Anime / Movies / TV lists instead of repeating Home's poster shelves. Category browsing also uses compact scrolling rows.
- **Sources** (`/sources`) is a modern community directory. Desktop gets a persistent category rail and a compact source index; mobile gets horizontal filters and the same dense source rows.

## Visual cleanup

- Removed **Browse** from the signed-in desktop nav to reduce Home/Browse duplication. Catalog is still reachable from Home search and the Home catalog button.
- Added a more visible but quiet Couchlist background: dark navy with very subtle red/yellow brand glows instead of a flat black shell or cinematic wallpaper.
- Stronger source row separation, alternating rows, compact ranking numbers, and clearer section framing.
- Source icons remain best-effort only. Missing favicons disappear rather than becoming noisy fake tiles.
- Mobile Source Directory keeps all filters in a horizontal scroller.

## Testing fix

Updated the public source-directory HTTP regression test to assert the current `Source Directory` copy instead of the retired `Anime, movies, and TV` headline.

## Version

Default `/about` version is now `12.6.0` in `.env.example` and shared config defaults. Existing local/Railway environment values still override the default.

## No database migration

This release is UI/navigation/test cleanup only. No database migration is required.

## Windows validation

```cmd
cd "C:\Users\caano\Documents\couchlist"

npm run lint
npm run typecheck
npm run build
npm test
npm audit
```

Then run the web app:

```cmd
npm run dev --workspace @couchlist/web
```

Check `/home`, `/search`, `/sources`, `/friends`, and `/my-server` on desktop and iPhone.
