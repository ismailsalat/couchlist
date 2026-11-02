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

## Retiring the bot service

The `apps/bot` workspace has been removed. Its data has not been: the
`discord_guilds`, `guild_settings`, `guild_memberships` and `server_watch_posts`
tables are all still there. Decide what to do with them separately, and write
that decision down before anyone runs a cleanup migration.
