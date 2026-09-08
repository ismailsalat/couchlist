# Couchlist production checklist

Couchlist is ready for a private beta once the live checks below pass. Do not treat a clean build alone as a production launch.

## Must pass before private beta

- `npm audit` reports 0 vulnerabilities.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- Discord OAuth works with a brand-new Discord account that has never authorized Couchlist.
- Main + two alt accounts can find each other, send/accept Couchlist friend requests, and remain friends even without a connected server.
- Friends Watching is driven by direct Couchlist friends. If two friends also share a connected server, that server is shown as extra context.
- `/admin setup` and `/admin status` work; a normal member cannot run admin actions.
- AniList search works live; TMDB movie and TV search work live.
- Ratings, progress, friend-circle averages, friend comparison, and Watch Together are correct with two or more direct friends.
- Connected server hubs correctly show community watching, highest-rated, want-to-watch, and member discovery without changing personal friend relationships.
- Private profile / hidden rating / hidden progress settings are respected from another account.
- A user cannot open a server they are not a member of, read a private profile, compare with an unauthorized stranger, or put a non-friend into Watch Together.
- Logout, disconnect, account deletion, and data export APIs work.
- Phone-sized layout works when opened from Discord mobile.

## Must do before a public launch

- Rotate every secret that was ever pasted into chat/screenshots: Discord bot token, Discord client secret, AUTH_SECRET, and TMDB key/token.
- Deploy behind HTTPS and change `APP_BASE_URL` to the production URL.
- Add the production Discord OAuth callback URL: `https://<domain>/api/auth/callback`.
- Set `ENVIRONMENT=production`, `NODE_ENV=production`, `ALLOW_DEV_LOGIN=false`, and normally `TEST_MODE=false`.
- Use Railway/PostgreSQL production credentials, not local credentials.
- Configure PostgreSQL backups and test restoring one backup before launch.
- Add TMDB-required attribution/branding in a Credits/About area.
- Add a short Privacy Policy that explains Discord identity/server data, watch data, retention, export, and deletion.
- Add normal UI controls for export, disconnect, and delete account; do not require users to open the browser console.
- Add production error monitoring/alerts in addition to logs and `/api/health`.

## Privacy edge case to resolve before broad public use

Guild membership is refreshed when a user signs in. If a user leaves a Discord server while their 30-day Couchlist session is still active, the stored membership can remain valid until the next Discord login refresh. Before a broad public launch, add a live or short-lived membership re-verification strategy so leaving a server removes access promptly.

For a tiny invite-only beta, keep TEST_MODE enabled and only allow trusted tester IDs while this is being validated.

## Scaling note

The current rate limiter is in process memory. It is fine for one small web instance, but if Couchlist is scaled to multiple web instances, move rate-limit state to a shared store such as Redis so limits are consistent across instances and restarts.
