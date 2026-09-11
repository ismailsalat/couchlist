ALTER TYPE "watch_report_reason" ADD VALUE IF NOT EXISTS 'SPAM';

DO $$ BEGIN
  CREATE TYPE "watch_health_vote" AS ENUM ('WORKING', 'BROKEN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "watch_source_candidates"
  ADD COLUMN IF NOT EXISTS "guild_id" text REFERENCES "discord_guilds"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "supports_anime" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_movies" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_tv" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "comment" text,
  ADD COLUMN IF NOT EXISTS "content_key" text,
  ADD COLUMN IF NOT EXISTS "media_type" "media_type",
  ADD COLUMN IF NOT EXISTS "media_title" text,
  ADD COLUMN IF NOT EXISTS "availability_url" text;

CREATE TABLE IF NOT EXISTS "server_watch_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL REFERENCES "discord_guilds"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "watch_source_id" text REFERENCES "watch_sources"("id") ON DELETE SET NULL,
  "domain" text NOT NULL,
  "homepage_url" text NOT NULL,
  "suggested_name" text NOT NULL,
  "comment" text,
  "content_key" text,
  "media_type" "media_type",
  "media_title" text,
  "supports_anime" boolean DEFAULT false NOT NULL,
  "supports_movies" boolean DEFAULT false NOT NULL,
  "supports_tv" boolean DEFAULT false NOT NULL,
  "is_hidden" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "server_watch_posts_guild_idx"
  ON "server_watch_posts" ("guild_id", "created_at");
CREATE INDEX IF NOT EXISTS "server_watch_posts_source_idx"
  ON "server_watch_posts" ("watch_source_id");
CREATE INDEX IF NOT EXISTS "server_watch_posts_domain_idx"
  ON "server_watch_posts" ("guild_id", "domain");

CREATE TABLE IF NOT EXISTS "watch_source_ratings" (
  "id" text PRIMARY KEY NOT NULL,
  "watch_source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "server_watch_post_id" text REFERENCES "server_watch_posts"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "guild_id" text REFERENCES "discord_guilds"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "watch_source_ratings_value_check" CHECK ("rating" between 1 and 5),
  CONSTRAINT "watch_source_ratings_target_check" CHECK ((("watch_source_id" is not null)::int + ("server_watch_post_id" is not null)::int) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_ratings_global_source_key"
  ON "watch_source_ratings" ("watch_source_id", "user_id")
  WHERE "watch_source_id" IS NOT NULL AND "guild_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_ratings_guild_source_key"
  ON "watch_source_ratings" ("watch_source_id", "user_id", "guild_id")
  WHERE "watch_source_id" IS NOT NULL AND "guild_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_ratings_post_key"
  ON "watch_source_ratings" ("server_watch_post_id", "user_id")
  WHERE "server_watch_post_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "watch_source_ratings_source_idx"
  ON "watch_source_ratings" ("watch_source_id", "guild_id");
CREATE INDEX IF NOT EXISTS "watch_source_ratings_post_idx"
  ON "watch_source_ratings" ("server_watch_post_id");

CREATE TABLE IF NOT EXISTS "watch_source_health_votes" (
  "id" text PRIMARY KEY NOT NULL,
  "watch_source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "server_watch_post_id" text REFERENCES "server_watch_posts"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "guild_id" text REFERENCES "discord_guilds"("id") ON DELETE CASCADE,
  "status" "watch_health_vote" NOT NULL,
  "reason" "watch_report_reason",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "watch_source_health_votes_target_check" CHECK ((("watch_source_id" is not null)::int + ("server_watch_post_id" is not null)::int) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_health_global_source_key"
  ON "watch_source_health_votes" ("watch_source_id", "user_id")
  WHERE "watch_source_id" IS NOT NULL AND "guild_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_health_guild_source_key"
  ON "watch_source_health_votes" ("watch_source_id", "user_id", "guild_id")
  WHERE "watch_source_id" IS NOT NULL AND "guild_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_health_post_key"
  ON "watch_source_health_votes" ("server_watch_post_id", "user_id")
  WHERE "server_watch_post_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "watch_source_health_source_idx"
  ON "watch_source_health_votes" ("watch_source_id", "updated_at");
CREATE INDEX IF NOT EXISTS "watch_source_health_post_idx"
  ON "watch_source_health_votes" ("server_watch_post_id", "updated_at");

ALTER TABLE "watch_source_reports"
  ALTER COLUMN "media_watch_source_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "watch_source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "server_watch_post_id" text REFERENCES "server_watch_posts"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "watch_reports_reporter_key";

DO $$ BEGIN
  ALTER TABLE "watch_source_reports"
    ADD CONSTRAINT "watch_reports_target_check"
    CHECK ((("media_watch_source_id" is not null)::int + ("watch_source_id" is not null)::int + ("server_watch_post_id" is not null)::int) = 1);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "watch_reports_source_idx"
  ON "watch_source_reports" ("watch_source_id", "created_at");
CREATE INDEX IF NOT EXISTS "watch_reports_post_idx"
  ON "watch_source_reports" ("server_watch_post_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "watch_reports_listing_reporter_key"
  ON "watch_source_reports" ("media_watch_source_id", "reported_by_user_id")
  WHERE "resolved_at" IS NULL AND "media_watch_source_id" IS NOT NULL AND "reported_by_user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_reports_source_reporter_key"
  ON "watch_source_reports" ("watch_source_id", "reported_by_user_id")
  WHERE "resolved_at" IS NULL AND "watch_source_id" IS NOT NULL AND "reported_by_user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "watch_reports_post_reporter_key"
  ON "watch_source_reports" ("server_watch_post_id", "reported_by_user_id")
  WHERE "resolved_at" IS NULL AND "server_watch_post_id" IS NOT NULL AND "reported_by_user_id" IS NOT NULL;
