# Manual testing checklist

Everything below needs a live Discord, AniList, TMDB, browser or Docker, none of
which were reachable in the environment Couchlist was built in. The database,
authorization, scoring, validation and HTTP layers were tested automatically —
run `npm test` for those.

Work top to bottom. Each step assumes the previous one passed.

---

## Before you start

```bash
npm install
cp .env.example .env      # fill in the values
npm run db:migrate
npm run db:seed
npm run dev               # terminal 1
npm run dev:bot           # terminal 2
```

---

## A. Discord OAuth

1. Open <http://localhost:3000> → click **Continue with Discord**
2. Discord shows a consent screen listing **only** "Access your username" and
   "Know what servers you're in". If it asks for anything more, stop — the
   scopes are wrong.
3. Approve → you land on `/home`

**Fails?** Check `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and that
`http://localhost:3000/api/auth/callback` is in the Discord redirect list.

## B. Discord bot login

1. In terminal 2 you should see `BOT_START` then `bot_ready` with your bot's tag
2. The bot shows online in your server member list

**Fails?** Check `DISCORD_BOT_TOKEN`.

## C. Slash command registration

1. Type `/` in your test server
2. You should see exactly six: `/couchlist` `/profile` `/watch` `/compare`
   `/pick` `/admin`
3. `/admin` should be hidden from members without Manage Server

Global commands can take up to an hour the first time. To register instantly in
one server: `npm run bot:register -- <your-guild-id>`

## D. /admin setup

1. Run `/admin setup` in your test server → "Couchlist is connected"
2. Run `/admin status` → Database Healthy, Server connected Yes, Couchlist users
   count, Uptime
3. Run `/admin setup` as a member **without** Manage Server → refused

## E. Main + alt seeing each other

1. Sign in on the website with your main account
2. Sign in with your alt (different browser or a private window)
3. Both accounts: **Friends** should list the other one
4. Add a title on the alt, set it to **Watching** → main's **Home** shows it
   under Friends Watching

**Nobody appears?** Run `/admin status` first; in TEST_MODE it repairs known tester memberships for accounts that already signed in. Confirm every tester ID is in `TEST_USER_IDS` and each account has signed into the website at least once. Sign out and back in to force a fresh Discord guild sync if needed.

## F. AniList live search

1. Search `attack on titan`
2. Results labelled **Anime** with year and episode count, posters visible
3. Open one → description, genres, studio present

## G. TMDB live search

1. Search `interstellar` → labelled **Movie**
2. Search `breaking bad` → labelled **TV Show**
3. Both show posters and a banner on the title page

**No movie/TV results?** `TMDB_API_KEY` is missing or wrong. Anime search will
still work — that is the intended degradation.

## H. Ratings, friend circle, and server perk

1. Main and Alt become direct Couchlist friends.
2. Main: open a title → **Completed** → rate **9**
3. Alt: same title → **Completed** → rate **7**
4. Either account: reload the title page
   - **With Your Friends** shows the other friend's activity
   - Friend-circle average reflects the friend's visible rating
   - The friend rating list shows the other account's score
5. If both accounts are also in a connected Discord server, the same page has a separate **Connected Server Taste** card for that server.

## I. Friend comparison

1. **Friends** → **Compare** next to your alt
2. With fewer than 3 commonly rated titles: "Watch a few more titles before we
   can calculate your taste match."
3. Rate three of the same titles on both accounts → reload → a percentage,
   shared title count, Both Loved, Biggest Disagreement

## J. Watch Together

1. Both accounts: add the _same_ title to **Plan to Watch**
2. Main: **Watch Together** → select your alt → **Anything** → **Find something**
3. That title appears, with "1 already want to watch it"
4. Mark it **Completed** on either account → search again → it disappears
5. Tick **Allow rewatch** → it comes back

## K. Logout, disconnect, delete

1. **Profile** → **Sign out** → you land on `/` and `/home` bounces you back
2. Sign in again, then in the browser console:
   ```js
   await fetch("/api/me/profile?mode=disconnect", { method: "DELETE" });
   ```
   Reload → you are signed out. Sign in again → your lists are still there.
3. Deletion (**this is permanent**):
   ```js
   await fetch("/api/me/profile", { method: "DELETE" });
   ```
   Reload → signed out. Sign in again → empty lists, fresh account.

## L. Unauthorized guild access

1. Signed in as your main account, visit `/server/<some-other-guild-id>`
   → "You don't have access to that server on Couchlist"
2. In the console:
   ```js
   await (await fetch("/api/guilds/123456789012345678")).json();
   ```
   → `403` with code `CL_FORBIDDEN_GUILD`
3. With `TEST_MODE=true`, visit a server that is **not** in `TEST_GUILD_IDS`
   → same refusal

## M. Playwright

```bash
npm run db:seed
npm run build
npm run test:e2e
```

Runs desktop and mobile projects against the dev login. Requires
`ALLOW_DEV_LOGIN=true` and `ENVIRONMENT=development` in `.env`.

## N. Docker build

```bash
docker build -f apps/web/Dockerfile -t couchlist-web .
docker build -f apps/bot/Dockerfile -t couchlist-bot .

docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host.docker.internal:5432/couchlist" \
  -e APP_BASE_URL="http://localhost:3000" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e DISCORD_CLIENT_ID=... -e DISCORD_CLIENT_SECRET=... -e TMDB_API_KEY=... \
  couchlist-web
```

Expect: migrations apply, then the server starts. Confirm it runs as a non-root
user with `docker run --rm couchlist-web whoami` → `couchlist`.

## O. Railway deployment

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub repo
3. **+ New → Database → PostgreSQL**
4. Web service variables (see README) → start command:
   `npm run db:deploy && npm run start --workspace @couchlist/web`
5. **+ New → Empty Service** → same repo, bot variables → start command:
   `npm run start --workspace @couchlist/bot`
6. Copy the web service's public domain into `APP_BASE_URL` **and** into the
   Discord redirect list as `https://<domain>/api/auth/callback`
7. Visit `https://<domain>/api/health` → `database: healthy`
8. Sign in on the deployed site
9. Confirm production safety: the deploy logs must **not** contain
   `dev_login_enabled`. If they do, `ALLOW_DEV_LOGIN` is set and the service
   should have refused to start — check `ENVIRONMENT=production`.

---

## Quick regression list

After any change, before deploying:

```bash
npm run check     # lint + typecheck + 156 tests
npm run build
```

## Mobile / installed PWA checks (v10.2)

Use at least one iPhone-sized viewport and one Android-sized viewport.

- Install/open Couchlist as a PWA and confirm the bottom Home / Friends / Watch / Profile controls sit above the OS home-gesture area.
- Tap each bottom destination near the lower half of its button. It should navigate without triggering the OS app-switch/home gesture.
- Scroll to the end of a page and confirm the last content is not hidden behind the fixed bottom bar.
- Focus Search, rating, episode progress, friend search, and privacy controls. iOS should not zoom the whole page when the keyboard opens.
- Rotate to landscape and confirm content does not sit under a notch/dynamic-island safe area.
- Swipe the Trending Anime / Movies / TV shelves horizontally. Scrolling should feel native and stop near poster boundaries.
- Desktop at 640 px and wider should keep the existing desktop navigation and should not show the bottom mobile bar.

## v10.4 discovery catalog

1. Open Search with an empty query and confirm All shows Anime, Movies, and TV starter shelves.
2. Open Anime and confirm Trending Anime and Popular Anime are both visible when AniList is healthy.
3. Open Movies and confirm Movies Right Now and Top Rated Movies are separate shelves.
4. Open TV Shows and confirm TV Right Now and Popular TV Shows are separate shelves.
5. Search for a title that is not visible in the starter shelves and confirm it still appears in search results.
6. Confirm the page copy makes it clear the shelves are starter picks rather than the entire Couchlist catalog.
7. On a phone/PWA, horizontally swipe each poster shelf and confirm the page itself does not scroll sideways.

## v10.5 long browse

- Open Search with no query. Confirm All clearly says the shelves are starting points, not the whole catalog.
- Confirm All shows Anime, Movies, and TV shelves with `See more` links.
- Open Anime, Movies, and TV tabs. Confirm each has Trending / Popular / Top Rated.
- Confirm the category page starts with 20 posters and `Load 20 more` appends the next page without replacing the first 20.
- Load at least three pages and confirm earlier posters remain on screen.
- Confirm switching ranking starts a fresh list instead of mixing rankings.
- Confirm searching a specific title still uses the normal search results path.
- On iPhone/PWA, confirm poster grids are three columns and the Load More button is comfortably above the bottom navigation safe area.
