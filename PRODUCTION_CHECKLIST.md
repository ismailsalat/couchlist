# Couchlist production checklist

A clean build is not a launch. Work through this before pointing real people
at it.

## Must pass

- [ ] `npm run check` (lint, typecheck, unit and integration tests) passes.
- [ ] `npm run test:e2e` passes on desktop and mobile projects.
- [ ] `npm run build` succeeds.
- [ ] `npm audit` is clean, or every finding is understood and recorded.
- [ ] `docs/DEPLOYMENT.md` has been read, including the backup step.

## Configuration

- [ ] `AUTH_SECRET` is at least 32 characters and is not the example value.
- [ ] `APP_BASE_URL` is the real https:// domain.
- [ ] `MAIL_TRANSPORT=auto` with a working `RESEND_API_KEY` and `MAIL_FROM`.
      The service refuses to start otherwise, which is the point.
- [ ] `ADMIN_EMAILS` contains only addresses that should be administrators.
      Clear it once the first administrator exists.
- [ ] `TEST_DATABASE_URL` does **not** point at production.
- [ ] Retired Discord and TMDB variables removed from the environment.

## Data

- [ ] A backup has been taken **and restored into a scratch database**.
- [ ] Row counts match before and after migration (see `docs/DEPLOYMENT.md`).
- [ ] The like/dislike backfill count equals the global health-vote count.
- [ ] Every legacy account came out with a display name.

## Content

- [ ] Seeded guides have been reviewed by a human and marked reviewed, or are
      left unpublished. An unreviewed guide tells readers so, which is honest
      but not a substitute for checking.
- [ ] No placeholder or example source is listed publicly.

## Live checks

- [ ] A brand-new address can sign up, receive a code, verify, vote and save.
- [ ] Password reset works end to end.
- [ ] A normal account cannot reach `/admin` or call any admin endpoint.
- [ ] `/api/health` reports `database: healthy` and `mail: configured`.
- [ ] The weekly link check is scheduled (`npm run check:links`), and has been
      run once by hand so `/admin/attention` starts from a known state.
- [ ] `/robots.txt` and `/sitemap.xml` show the real domain, and private paths
      are disallowed.
- [ ] A signed-in page's HTML contains no email address and no password hash.
      (`tests/integration/http.test.ts` asserts this; confirm it on the real
      deploy too.)

## Dependencies

Run `npm audit` before each deploy and read what it says rather than running
`npm audit fix --force`, which will happily downgrade Next.js and break the
build.

As of this build:

- **Next.js is pinned to 16.4.3.** Do not go back to 16.3.x. Those releases
  carry unauthenticated remote-code-execution advisories in image
  optimization and in `use cache`. The upgrade is a patch-level bump and the
  whole suite passes on it.
- **Two advisories remain in the production tree**, both without a safe fix
  today, both mitigated here:
  - `zod` below 4.6.6 can exhaust memory on an oversized collection. Moving to
    zod 4 is a breaking change across every schema in the project. Instead
    every request body is capped at 2 MB before anything parses it
    (`MAX_REQUEST_BODY_BYTES`), so no validator is ever handed a payload large
    enough. Revisit when a 3.x patch appears, or budget the v4 migration.
  - `source-map-js` arrives through Next's own copy of postcss and is used at
    build time, not in request handling. It is pinned by Next and moves when
    Next does.
- The rest of what `npm audit` reports is development tooling (vitest's vite,
  build-time helpers) and is not shipped.

## Security

Verified in this build, each with a test that fails without it:

- Every state-changing request checks its `Origin` against this site, on top
  of a `SameSite=Lax` session cookie.
- `Content-Security-Policy` with `frame-ancestors 'none'`, `form-action
  'self'`, `base-uri 'none'` and `object-src 'none'`. Scripts still allow
  `'unsafe-inline'`, which is Next's hydration payload; the comment in
  `proxy.ts` explains what that does and does not buy.
- Uploaded images keep their own far stricter sandboxed policy, which the
  site-wide one does not overwrite.
- HSTS only over a real HTTPS connection, so local development is unaffected.
- Addresses from contributors are refused if they point anywhere inside the
  network, including the decimal, octal and IPv6-mapped spellings of
  localhost and the cloud metadata address.
- `next` after sign-in accepts only a plain path on this site.

## Known gaps

Read `docs/REMAINING_WORK.md` and decide which gaps block your launch.
Notifications and the legacy-account transition are the ones most likely to
matter.
