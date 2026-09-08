# Couchlist

**Track what your friends watch.**

Most trackers answer "what am I watching?". Couchlist answers "what are my
friends watching?" Sign in with Discord, build a direct Couchlist friend list,
track anime, movies and TV, compare tastes, and find something to watch
together. A Discord server is **not required** for the personal social features.

Server owners can optionally connect the Couchlist bot to unlock a community
hub: server-wide favorites, what members are watching, what the server wants to
watch next, and discovery of other Couchlist users in that community.

The website is the product. The Discord bot is a light bridge and optional
server integration.

---

## Features

- **Discord sign-in** — no separate password, minimum OAuth scopes
- **Track** anime, movies and TV with three statuses: Watching, Completed, Plan to Watch
- **Rate** 1–10 with one decimal place and record episode progress
- **Friends** — explicit Couchlist friend connections that work without a server
- **Optional server hubs** — community taste, member activity, favorites and plan-to-watch overlap
- **Taste match** — a plain, deterministic comparison between two people
- **Watch Together** — overlapping picks from your Couchlist friends' Plan to Watch lists
- **Privacy controls** — friends/shared connected servers or private, hide ratings, hide progress
- **Test mode** — lock the whole product to a named list of accounts and servers
- **PWA** — install Couchlist to a phone/home screen without a separate native app

Not built, on purpose: XP, coins, achievements, followers, comments, public
profiles, AI recommendations, a social feed.

## Technology

| | |
|---|---|
| Language | TypeScript |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS |
| Database | PostgreSQL + Drizzle ORM |
| Bot | discord.js 14 |
| Validation | Zod |
| Tests | Vitest (unit + integration), Playwright (browser smoke) |
| Deploy | Docker, Railway |

**On the ORM:** Couchlist uses Drizzle. It is pure TypeScript with no engine
binaries to download, which keeps `npm install` and CI simple, and it covers
everything needed here — migrations, foreign keys, unique constraints,
transactions and parameterised queries. Every database path in this repository
has been executed against a real PostgreSQL instance.

---

## Quick start

```bash
git clone <your-repo> couchlist && cd couchlist
npm install

# First install after the security refresh creates a new package-lock.json.
# Keep that lockfile after npm audit/check pass.

cp .env.example .env          # fill in the values below
createdb couchlist            # or use Docker/Railway Postgres

npm run db:migrate            # create the schema
npm run db:seed               # optional: two fake accounts and some titles
npm run dev                   # http://localhost:3000
```

For the bot, in a second terminal:

```bash
npm run dev:bot
```

### Commands

| Command | Does |
|---|---|
| `npm install` | Install everything |
| `npm run dev` | Web app on :3000 |
| `npm run dev:bot` | Discord bot |
| `npm run build` | Build all workspaces |
| `npm start` | Run the built web app |
| `npm run start:bot` | Run the built bot |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run test:integration` | Integration tests (needs PostgreSQL) |
| `npm run test:e2e` | Playwright browser smoke tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript across every workspace |
| `npm run check` | Lint, typecheck and test together |
| `npm run db:migrate` | Apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production, forward-only) |
| `npm run db:seed` | Development seed data — refuses in production |
| `npm run db:reset` | Empty the database — refuses in production |
| `npm run bot:register` | Re-register slash commands |


> **Migration note:** runtime migrations use Drizzle ORM's PostgreSQL migrator and the committed SQL files in `packages/db/migrations/`. Drizzle Kit is intentionally not installed in this release because its current CLI dependency chain includes outdated development-only esbuild packages. Schema changes should add a reviewed SQL migration file and update the migration journal until the CLI chain is clean.

---

## Environment variables

Full list with comments in [`.env.example`](.env.example).

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://…`. Railway: `${{Postgres.DATABASE_URL}}` |
| `APP_BASE_URL` | yes | Public URL. Must be `https://` in production |
| `DISCORD_CLIENT_ID` | web | From the Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | web | Never commit this |
| `DISCORD_BOT_TOKEN` | bot | Never commit this |
| `AUTH_SECRET` | web | `openssl rand -base64 32` |
| `TMDB_API_KEY` | yes | v3 key or v4 token; movies/TV need it |
| `BOT_OWNER_IDS` | | Comma-separated Discord user IDs |
| `TEST_MODE` | | `true` locks access to the allowlists below |
| `TEST_GUILD_IDS` / `TEST_USER_IDS` | | Comma-separated snowflakes |
| `ALLOW_DEV_LOGIN` | | Development only. Production refuses to start with it on |
| `LOG_LEVEL`, `LOG_JSON` | | `info`, and JSON logs in production |
| `RATE_LIMIT_*_PER_MINUTE` | | Per-user limits, sensible defaults |

Startup validates all of this and prints every problem at once rather than
failing on the first one.

---

## Discord setup

1. <https://discord.com/developers/applications> → **New Application**
2. **OAuth2** → copy **Client ID** and **Client Secret**
3. **OAuth2 → Redirects** → add `https://your-domain/api/auth/callback`
   (and `http://localhost:3000/api/auth/callback` for local work)
4. **Bot** → **Reset Token** → copy into `DISCORD_BOT_TOKEN`
5. **Privileged Gateway Intents: leave all three OFF.** Couchlist does not read
   messages, members or presence.
6. **OAuth2 → URL Generator** to invite the bot:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **Send Messages**, **Embed Links**, **Use Slash Commands**
   - Do **not** grant Administrator.

The login scopes Couchlist requests are `identify` and `guilds` — enough to know
who you are and which servers you are in, nothing more.

## TMDB setup

1. Create an account at <https://www.themoviedb.org>
2. **Settings → API** → request a key (choose *Developer*, personal use is fine)
3. Copy either the **API Key (v3 auth)** or the **API Read Access Token (v4)**
   into `TMDB_API_KEY` — the adapter detects which you gave it

Anime uses Jikan/MyAnimeList public catalog data and needs no key or account. AniList remains only for legacy title links created before v10.8.

---

## Test mode

While you are testing with your own accounts, set:

```
TEST_MODE=true
TEST_USER_IDS=<your discord id>,<your alt's discord id>
TEST_GUILD_IDS=<your test server id>
```

Then:

- only those accounts can sign in; everyone else gets a "private testing" page
- the bot only responds inside those servers
- server pages outside the allowlist return 403 even by direct URL
- automatic notifications are disabled
- a small **TEST MODE** badge appears in the header
- startup logs the allowlist **sizes**, never the IDs

To get a Discord ID: User Settings → Advanced → Developer Mode, then right-click
a user or server → Copy ID.

Once both accounts have signed in once, they can add each other as Couchlist friends even with no server integration. If the bot is connected to a shared server, that server hub appears as an extra community perk.

---

## Deployment (Railway)

Three services: **Postgres**, **Couchlist Web**, **Couchlist Bot**. Both apps
share one `DATABASE_URL`.

1. **New Project** → **Deploy from GitHub repo**
2. **+ New** → **Database** → **PostgreSQL**
3. **Couchlist Web** service → Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_BASE_URL=https://<your-web-domain>
   ENVIRONMENT=production
   NODE_ENV=production
   LOG_JSON=true
   DISCORD_CLIENT_ID=…
   DISCORD_CLIENT_SECRET=…
   AUTH_SECRET=…
   TMDB_API_KEY=…
   ```
   Start command: `npm run db:deploy && npm run start --workspace @couchlist/web`
4. **+ New** → **Empty Service** → same repo, for the bot. Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_BASE_URL=https://<your-web-domain>
   ENVIRONMENT=production
   DISCORD_BOT_TOKEN=…
   BOT_OWNER_IDS=…
   ```
   Start command: `npm run start --workspace @couchlist/bot`
5. Add the web service's public domain to the Discord OAuth redirect list.

Migrations run forward-only as part of the web service's start command. Nothing
in the deploy path can drop or reset production data.

### Docker

```bash
docker build -f apps/web/Dockerfile -t couchlist-web .
docker build -f apps/bot/Dockerfile -t couchlist-bot .
```

Both images run as a non-root user.

---

## Project structure

```
apps/
  web/                Next.js app
    src/app/          Pages and API routes
    src/components/   React components
    src/lib/          Config, db, auth, guards, services
  bot/                discord.js bot
    src/commands/     One file per command
packages/
  db/                 Drizzle schema, migrations, repositories
  shared/             Config, errors, logging, providers, scoring, schemas
tests/
  unit/               Pure logic, no database
  integration/        Real PostgreSQL and real HTTP
  e2e/                Playwright browser smoke tests
```

Routes call services, services call repositories, repositories talk to the
database. The scoring formulas are pure functions in `packages/shared` with no
I/O, which is why they are cheap to test exhaustively.

---

## Bot commands

| Command | Does |
|---|---|
| `/couchlist` | Link to the site |
| `/profile` | Your counts, plus a link to your full profile |
| `/watch <query>` | Look up a title and see what this server thinks |
| `/compare <user>` | Taste match with someone in this server |
| `/pick` | Link to Watch Together |
| `/admin setup` | Connect Couchlist to this server |
| `/admin status` | Database, connection, user count, uptime |

`/admin` requires **Manage Server**, the server owner, or a configured bot
owner. Permissions are re-checked when the command runs, not only by Discord.

---

## Security and privacy

- Authorization is server-side on every protected route; hidden buttons are not
  a control
- You can add Couchlist friends directly. Shared connected servers also allow member discovery and server-scoped profile access, unless a profile is private
- Private ratings and progress are stripped from the payload, not just the markup
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production; the
  database stores only a SHA-256 hash of each token
- Deleting or disconnecting an account revokes every active session immediately
- Authenticated pages and API responses are `private, no-store`
- Duplicate list entries are impossible because of a database unique constraint
- Audit metadata is filtered before it is written, so a secret cannot land there
- Couchlist never reads Discord messages or DMs

Couchlist does not have access to your real Discord friends list. "Friends" are explicit Couchlist connections you create inside the app. Discord servers are optional community hubs and a discovery source.

## Licence

Provided as-is for you to deploy and modify.


## Product philosophy

Couchlist follows a **stable core, small improvements** rule. The app should stay familiar instead of being redesigned every release, and new features should prefer simple, durable code over fragile integrations. See `PRODUCT_PRINCIPLES.md` and `SIMPLE_ROADMAP.md`.

The web app is also installable as a lightweight PWA. PWA caching is intentionally limited to static assets; authenticated pages and API data are never cached by the service worker.
