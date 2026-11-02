# Couchlist v12.7 — Directory Background + Home Cleanup

This pass keeps the v12.6 directory/catalog direction and makes the branding visible without turning Couchlist into a streaming storefront.

## What changed

- Added a subtle repeated Couchlist popcorn pattern across the app background.
  - Same simple popcorn marks repeat at different positions and rotations.
  - Includes a tiny outlined popcorn bucket motif.
  - Pattern is intentionally low-contrast so posters, lists, and source data stay readable.
- Strengthened the permanent page background with restrained red, popcorn-yellow, blue, and navy depth.
- Kept all directory/catalog surfaces opaque enough that the pattern never interferes with reading.
- Made Source Directory rows/panels more visually separated from the background.
- Simplified Home:
  - removed the two large header CTA buttons;
  - added one compact four-item directory shortcut strip for Catalog, Sources, Friends, and Servers;
  - tightened the welcome copy;
  - renamed "Trending Right Now" to "Discover" so Home reads like a catalog dashboard, not a streaming homepage.
- Mobile uses a smaller version of the same pattern and retains the existing safe-area navigation behavior.
- Default `/about` version is now `12.7.0`.

## No migration

No database migration is required for v12.7.

## Windows test

```cmd
cd "C:\Users\caano\Documents\couchlist"

npm run lint
npm run typecheck
npm run build
npm test
npm audit

npm run dev --workspace @couchlist/web
```

Test at minimum:

- `/home`
- `/search`
- `/sources`
- `/friends`
- `/my-server`

Check both desktop and iPhone/PWA layouts.
