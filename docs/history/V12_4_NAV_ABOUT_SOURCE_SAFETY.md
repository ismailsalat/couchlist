# Couchlist v12.4 — Mobile nav, /about resilience, and source safety

This pass fixes three production rough edges without adding another subsystem.

## Mobile navigation

The mobile bottom navigation now includes **Sources** alongside Home, Server, Friends, Watch, and Profile. The six-item layout gets slightly smaller labels/icons on narrow iPhones so it stays readable without wrapping.

## `/about` bot command

`/about` is now defensive against blank optional environment values and malformed optional URLs. Rich buttons are only rendered for valid http(s) URLs. If Discord rejects the rich embed/buttons for any reason, the command automatically falls back to a simple text response instead of returning an Error ID.

The default displayed version is now `12.4.0`. Existing `COUCHLIST_ABOUT_*` variables remain compatible; no new environment variable is required.

## External source safety

Global Sources, server Sources, and title Watch sections now show the same compact warning:

- external links can change;
- use an ad blocker;
- avoid downloads or sign-ins on unfamiliar sites;
- report suspicious links;
- a VPN may improve privacy but does not make an unsafe site safe.

The notice is deliberately small and mobile-friendly. It does not add a blocking modal or another click to every link.

## Database

No migration is required.

## Windows validation

After applying the patch, run:

```cmd
cd "C:\Users\caano\Documents\couchlist"

npm run lint
npm run typecheck
npm run build
npm test
npm audit
```

Then redeploy/restart both Railway services so the web navigation/safety notice and bot `/about` fix are live.
