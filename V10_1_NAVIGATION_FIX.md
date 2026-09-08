# Couchlist v10.1 — navigation and discovery polish

This release fixes the local-development freeze/hydration issue without adding a new framework, state library, database table, or background service.

## What changed

- The PWA service worker no longer intercepts page navigation, API calls, or Next.js RSC/Flight responses.
- Local development automatically removes old Couchlist service workers and their caches, then reloads once if an old worker was controlling the page.
- `/sw.js` is served with no-store headers so worker updates are not held by an HTTP cache.
- Home trending cards are compact fixed-width shelves instead of stretching when a category has only a few results.
- Trending is separated into Anime, Movies, and TV Shows.
- Home asks the existing discovery provider for a larger sample, but still displays at most six items per shelf.

## Why

A service worker from the first PWA version could cache Next.js development assets/RSC responses. During HMR that could pair fresh server HTML with an older client bundle, producing hydration mismatches and failed client navigation. The new cache policy only allows fingerprinted `/_next/static/` assets and PWA icons.

## Stability rule

Dynamic Couchlist data stays network/database driven. The service worker is optional and must never be required for tracking, friends, communities, or list status changes to work.
