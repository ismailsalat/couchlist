# Deployment, migration and rollback

Couchlist deploys to Railway as a single web service plus a PostgreSQL
database. The Discord bot service is gone; if your Railway project still has
one, it can be deleted once you have confirmed the web service is healthy.

**Nothing in this document has been run against your production database.** The
migrations below were applied and verified against a local PostgreSQL 16 with
representative legacy data, which is not the same as your data.

## Before you deploy

1. **Take a backup you have restored from.** An untested backup is a hope, not
   a plan.
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file=couchlist-pre-rebuild.dump
   # confirm it restores into a scratch database before going further
   createdb couchlist_restore_check
   pg_restore --dbname=couchlist_restore_check couchlist-pre-rebuild.dump
   ```
2. **Set the new environment variables** (see `.env.example`):
   - `AUTH_SECRET` — already set if you were running the previous version.
   - `MAIL_TRANSPORT=auto`, `RESEND_API_KEY`, `MAIL_FROM` — **required**. The
     web service refuses to start in production without a mail provider,
     because an unverifiable signup is a broken signup.
   - `ADMIN_EMAILS` — the address you will sign up with, so you get the
     administrator role. You can clear it afterwards.
   - `CONTACT_EMAIL` — the address shown on /about, /privacy, /terms and in
     security.txt. Optional: left unset it becomes `hello@` on your own
     domain. Whatever it resolves to must actually receive mail, because it is
     where removal requests and security reports arrive, and an address that
     bounces is worse than none.
   - `SITE_OPERATOR` — the name /about says runs the site.
   - Discord and TMDB variables are no longer read and can be removed.
3. **Run the migrations** (`npm run db:deploy`). They are forward-only and
   additive; see below.

## What the migrations do

Migrations `0010`–`0015` are additive. No table is dropped, no column is
removed, and no row is deleted.

| Migration | Effect |
| --- | --- |
| `0010_report_reason_lots_of_ads` | Adds the `LOTS_OF_ADS` report reason. Alone in its own file because PostgreSQL will not let a new enum value be *used* in the transaction that adds it. |
| `0011_email_accounts` | Makes `users.discord_id` nullable and adds `email`, `password_hash`, `display_name`, `email_verified_at`, `is_admin`, `deleted_at`. Backfills `display_name` from the existing `global_name`/`username`. Adds `auth_tokens`. |
| `0012_source_directory` | Adds description, icon, ad warning and the three new category columns to `watch_sources`. Adds `source_votes`, `source_bookmarks`, `source_contributions`, `source_revisions`. Extends `watch_source_candidates` with corrections and credit. |
| `0013_guides` | Adds `guides` and `guide_suggestions`. |
| `0014_collections` | Adds `source_collections` and `source_collection_items`. |
| `0015_deleted_account_identity` | Relaxes the identity constraint so a deleted account may keep neither identifier. |
| `0016_source_icons_and_grouped_suggestions` | Adds `source_icons` (the uploaded bytes, capped at 256 KB and limited to PNG/JPEG/WebP by a check constraint) and an `icon_mime` column on `watch_sources` and `watch_source_candidates`. Replaces the one-pending-suggestion-per-domain unique index with one per *submitter* per domain, so several people can suggest the same website and all be credited. |
| `0017_avoid_warning_and_avatars` | Adds `should_avoid` and `avoid_reason` to `watch_sources`, `proposed_should_avoid` to `watch_source_candidates`, a `user_id` target on `source_icons` (so profile pictures reuse the validated-image table) and `avatar_mime` on `users`. Replaces the icon target check so exactly one of source, candidate or user owns each image. |
| `0018_trusted_sources` | Adds `trusted_rank`, `trusted_note` and `trusted_at` to `watch_sources`, with a bounds check and a partial index. Null means the usual ranking applies; a number pins the source above everything unpicked. |
| `0019_source_quality` | Adds `quality_label` to `watch_sources`, a short free-text note bounded to twelve characters by a check constraint. |
| `0020_link_health` | Adds `health_status`, `health_status_code`, `health_failures` and `health_detail` to `watch_sources`, plus two partial indexes: one that finds the sources due for a check, one that finds the sources currently failing. Nothing is backfilled, so every source starts as never-checked and the page says nothing about it until the checker has run. |
| `0021_mirrors_stats_and_profiles` | Adds `watch_source_domains` (the addresses a listing answers on) and backfills one row per existing listing; soft-delete columns on `watch_sources` with an index; an aggregate `visit_count`; `survey_responses`; and a bio on `users`. Nothing a reader sees changes: every new column starts at a value meaning "nothing has happened yet". |
| `0022_site_previews` | Adds `kind` and `source_note` to `source_icons` so a listing may hold one icon and one preview through the same validated pipeline, replaces the one-image-per-source index with one per source per kind, and adds `preview_mime` to `watch_sources`. |
| `0023_preview_review` | Adds `approved` and `captured_from` to `source_icons`, with a partial index for the review queue. Everything that exists already was put there by a person, so it is approved; only a bot's screenshot arrives unapproved. |

Two changes are worth reading closely before you run them.

### The like/dislike backfill

`0012` copies existing global reliability votes into the new `source_votes`
table: `WORKING` becomes a like, `BROKEN` becomes a dislike. Votes scoped to a
Discord server (`guild_id IS NOT NULL`) are left alone, because they belonged
to one community rather than to the public directory.

The original `watch_source_health_votes` rows are **not** deleted. If the
mapping turns out to be wrong for your data, the source of truth is still
there and the new table can be rebuilt.

### The candidate domain index

`0012` drops `watch_candidates_domain_key` and replaces it with a partial
unique index on pending new-source suggestions. The old index made a domain
unique for all time, so a rejected domain could never be suggested again and a
correction could not reference an already-listed domain. Existing rows are not
touched.

## Verifying a migration

Run these after `npm run db:deploy` and compare against the same numbers taken
before it:

```sql
SELECT
  (SELECT count(*) FROM users)                     AS users,
  (SELECT count(*) FROM watch_sources)             AS sources,
  (SELECT count(*) FROM media_entries)             AS legacy_entries,
  (SELECT count(*) FROM watch_source_candidates)   AS candidates,
  (SELECT count(*) FROM watch_source_health_votes) AS legacy_votes,
  (SELECT count(*) FROM source_votes)              AS directory_votes;

-- Every legacy account should have come out with a display name.
SELECT count(*) FROM users WHERE display_name IS NULL;

-- The backfill should match the global health votes exactly.
SELECT count(*) FROM watch_source_health_votes
 WHERE watch_source_id IS NOT NULL AND guild_id IS NULL;
```

`users`, `watch_sources`, `media_entries` and `watch_source_candidates` must be
unchanged. `directory_votes` should equal the global health-vote count.

## Rolling back

The migrations are forward-only; there is no down-migration, deliberately, so a
deploy cannot wipe production data by accident.

- **The deploy is bad but the data is fine.** Roll the application back to the
  previous release. The added tables and columns are inert to older code, with
  one exception: the old build expects `users.discord_id` to be `NOT NULL`, and
  it will be nullable. Old Discord accounts still have theirs, so a rollback
  works for them; accounts created through email signup in the meantime will
  not be usable by the old build.
- **The data is wrong.** Restore the backup into a new database, point
  `DATABASE_URL` at it, and redeploy. This is why step 1 exists.

## After deploying

1. Sign up with the address in `ADMIN_EMAILS` and verify it. Confirm a real
   email arrives — if it does not, the mail provider is misconfigured and no
   one else can register either.
2. Run `npm run db:seed:guides` once to load the starter guide set.
3. Open `/admin/guides`. **Every seeded guide is marked "not yet reviewed",**
   and the UI tells readers so. Check the links, the platform support and the
   pricing of each one, then tick "I checked the links and claims just now"
   when saving. Do not skip this: the guides came from a design reference and
   have not been verified against current documentation.
4. Check `/api/health` reports `database: healthy` and `mail: configured`.
5. Spot-check `/robots.txt` and `/sitemap.xml` against your real domain.
6. Add the weekly link check (below) and run it once by hand, so
   `/admin/attention` starts from a known state.
7. Open `/about`, `/privacy`, `/terms` and `/.well-known/security.txt` on the
   real domain and read them. They state facts about this deployment — that
   there are no analytics, that nothing is hosted here, who runs it — and if
   any of that stops being true for your deployment, the pages are now wrong
   and need editing. Check the contact address receives mail.
8. Verify the domain in Google Search Console and open **Security & Manual
   Actions → Security Issues**. It should say no issues detected. This is how
   you find out the day that changes, rather than from a user.

## The weekly job

**One scheduled job, set up once.** It does three things in order, and none of
them changes what a reader sees without a person deciding:

1. Checks every listed link, and flags what has stopped answering.
2. Empties the deleted bin of anything past its thirty days.
3. Photographs up to ten listings that have no picture, for review.

```
npm run maintenance          # all three, which is what the schedule runs
npm run check:links          # just the link check
npm run capture:previews     # just the screenshots
```

Any step that fails is logged and the rest still run: a site that cannot be
photographed is no reason to skip the link check. The whole thing exits as
soon as it is done, which matters — a scheduled job that leaves a database
connection open never terminates, and a host that sees the previous run still
going will skip the next one.

### Setting it up on Railway

A Railway cron job is a **whole service** that starts on a schedule, runs its
start command, and shuts down. So this is a second service in the same
project, pointing at the same repository as the web app:

1. **New** → **GitHub Repo** → the same repository. Name it something like
   `couchlist-weekly`.
2. **Variables** → add `DATABASE_URL`, referencing the same database service
   the web app uses. Nothing else is needed.
3. **Settings** → **Custom Start Command**:
   ```
   npm run db:deploy && node packages/db/dist/scripts/maintenance.js
   ```
   (`db:deploy` is a no-op when the migrations are already applied, and makes
   this service safe to run before the web app on a fresh database.)
4. **Settings** → **Cron Schedule**: `0 4 * * 1`
5. **Settings** → turn off any healthcheck. This service is meant to exit;
   a healthcheck would mark it failed for doing exactly that.

Five fields, in order: minute, hour, day of month, month, day of week. So
`0 4 * * 1` is 04:00 on Mondays. Railway runs these on **UTC**, so adjust for
where you are.

The site is perfectly fine without this. Nothing breaks if you never add it:
links simply never get checked automatically, and the only pictures on
listings are the ones you add yourself.

### About the browser

Screenshots need Chromium, which `nixpacks.toml` adds to the build for this
reason. It costs about 300 MB in the image. With no browser the job logs one
line saying screenshots are off and carries on with the rest — so deleting
the `nixPkgs` line is a complete and safe way to opt out.

Two things the capture job deliberately does not do: publish anything (every
screenshot waits on `/admin/previews` for a person), and run inside the web
service (a browser in a request path is how a site falls over under its first
real traffic).

## If a blocker flags the site

A new domain that collects an email and a password, and links out to a few
dozen third-party sites, is the shape heuristic blocklists treat as suspect.
Expect the occasional flag from a browser extension, and deal with it in this
order:

1. **Check whether it is just that one.** Google Safe Browsing (Chrome,
   Firefox, Safari) is the one that reaches nearly everyone:
   `https://transparencyreport.google.com/safe-browsing/search?url=<domain>`.
   VirusTotal shows about ninety engines at once; one or two obscure ones
   calling a site suspicious is normal background noise.
2. **If Google has flagged it**, request a review in Search Console under
   Security Issues. That is the fast route for site owners, and phishing
   reviews take roughly a day. Submit once and wait.
3. **If it is one extension**, use its own report form. Most block pages have
   one behind their "learn more" link.
4. **Do not work around it.** Never put a redirect or interstitial on this
   domain that bounces visitors to a listed site: passing traffic through
   your own domain to a flagged one is the surest way to inherit its
   reputation. The direct `rel="noopener noreferrer nofollow"` links the
   source rows use are deliberate.

The things that make this rarer over time are dull: domain age, a contact
address that answers, the information pages above, working SPF/DKIM/DMARC on
the sending domain, and no behaviour that resembles phishing.

## Retiring the bot service

The `apps/bot` workspace has been removed. Its data has not been: the
`discord_guilds`, `guild_settings`, `guild_memberships` and `server_watch_posts`
tables are all still there. Decide what to do with them separately, and write
that decision down before anyone runs a cleanup migration.
