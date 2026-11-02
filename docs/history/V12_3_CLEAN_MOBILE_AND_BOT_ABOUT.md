# Couchlist v12.3 — clean mobile sources + `/about`

## What changed

- Added a global Discord `/about` command with a configurable embed.
- `/about` can show the Couchlist website, source directory, support/community server, version, creator, and footer text.
- Added environment variables for every visible `/about` value.
- Fixed the iPhone/PWA sticky-header safe-area gap that let page content show above the nav while scrolling.
- Simplified the public source directory on phones and desktop:
  - compact horizontal filters
  - one small sort menu
  - lighter source rows instead of oversized cards
  - smaller vote and Open controls
  - plain metadata instead of a wall of colored tags
- Source favicons now try a few real site icon paths. If a site has no usable icon, Couchlist shows no fake fallback tile.
- Public suggestion flow remains at the bottom and still goes through admin review.

## New `/about` environment variables

```env
COUCHLIST_ABOUT_NAME=Couchlist
COUCHLIST_ABOUT_VERSION=12.3.0
COUCHLIST_ABOUT_DESCRIPTION=Track what your friends watch, share sources, and find something to watch together.
COUCHLIST_ABOUT_WEBSITE_URL=https://couchlist.io
COUCHLIST_ABOUT_SERVER_URL=https://discord.gg/qvGnUFn3VW
COUCHLIST_ABOUT_SERVER_NAME=Couchlist Community
COUCHLIST_ABOUT_CREATOR_NAME=Ismail
COUCHLIST_ABOUT_CREATOR_URL=
COUCHLIST_ABOUT_FOOTER=Good shows. Better company.
```

If `COUCHLIST_ABOUT_WEBSITE_URL` is empty, `/about` falls back to `APP_BASE_URL`.

## Windows validation

```cmd
cd "C:\Users\caano\Documents\couchlist"
npm run lint
npm run typecheck
npm run build
npm test
npm audit
npm run bot:register
```

Then start locally:

```cmd
npm run dev --workspace @couchlist/web
```

## Railway

Add the `/about` variables to the `@couchlist/bot` service. Keep `APP_BASE_URL=https://couchlist.io` on both the web and bot services after the custom domain is live.
