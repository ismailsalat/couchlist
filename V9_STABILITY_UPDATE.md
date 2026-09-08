# V9 Stability-First Update

This update deliberately adds only low-maintenance improvements.

## Added
- installable PWA manifest and Couchlist app icons
- tiny static-asset-only service worker; private HTML/API responses are not cached
- immediate success/error confirmations for list updates
- ratings accept one decimal place (for example 8.7)
- a more playful/cozy home hero without adding a UI framework or image runtime dependency
- connected community cards show a small snapshot of what members are watching and want to watch
- permanent product principles and a deliberately short roadmap
- design-direction reference for future changes

## Intentionally not added yet
Watch Parties, Live Now, AniList import, server suggestions and push notifications are valuable, but each changes persistence/API behavior. They remain separate future releases so Couchlist does not become a giant fragile update.

The next release should add **one coherent feature at a time**, test it, then stop.
