# Couchlist v10.2 — mobile/PWA polish

This release keeps the existing Couchlist layout and only improves small-screen ergonomics.

## Mobile navigation

- Bottom navigation now uses large icon + label targets instead of tiny text-only links.
- Each destination has a touch target comfortably above the 44 px mobile minimum.
- The bar adds `env(safe-area-inset-bottom)` padding so iPhone's home gesture sits below the controls instead of on top of them.
- Main page content reserves matching bottom space so the fixed bar never covers the last card or button.

## iPhone / PWA fit

- The viewport uses `viewport-fit=cover` and explicit safe-area insets.
- The top bar respects the status-bar/notch safe area.
- Left/right safe areas are respected in landscape.
- Form controls are at least 16 px on small screens so iOS does not zoom the page when an input receives focus.
- Tap targets use `touch-action: manipulation` and remove the delayed/tinted mobile tap feel without disabling pinch zoom.

## General phone polish

- Body uses dynamic viewport height (`100dvh`) and prevents accidental horizontal page overflow.
- Trending shelves use momentum scrolling, scroll snapping, and hidden scrollbars on touch devices.
- Header/profile touch areas are larger on phones.

## Stability

- No dependency added.
- No database migration.
- No new state library.
- No user-agent sniffing.
- No JavaScript layout measurement.
- Desktop layout remains unchanged at the existing `sm` breakpoint.
