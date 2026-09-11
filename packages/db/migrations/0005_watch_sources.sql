DO $$ BEGIN
  CREATE TYPE "watch_source_type" AS ENUM ('OFFICIAL', 'FREE_AD_SUPPORTED', 'RENT_BUY', 'LIBRARY', 'PUBLIC_DOMAIN', 'COMMUNITY', 'UNVERIFIED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_access_type" AS ENUM ('SUBSCRIPTION', 'FREE', 'FREE_WITH_ADS', 'RENT', 'BUY', 'LIBRARY_CARD', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_availability_status" AS ENUM ('AVAILABLE', 'UNKNOWN', 'RECENTLY_UNAVAILABLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_source_origin" AS ENUM ('OFFICIAL_API', 'MANUAL', 'COMMUNITY', 'DIRECTORY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_candidate_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_report_reason" AS ENUM ('BROKEN_LINK', 'WRONG_TITLE', 'WRONG_EPISODE', 'MISLEADING_QUALITY', 'UNSAFE_REDIRECT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_quality" AS ENUM ('4K', '1080p', '720p', 'SD', 'HD_CLAIMED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "watch_audio" AS ENUM ('SUB', 'DUB', 'SUB_DUB', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "watch_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "homepage_url" text NOT NULL,
  "source_type" "watch_source_type" NOT NULL,
  "access_type" "watch_access_type" DEFAULT 'UNKNOWN' NOT NULL,
  "supports_anime" boolean DEFAULT false NOT NULL,
  "supports_movies" boolean DEFAULT false NOT NULL,
  "supports_tv" boolean DEFAULT false NOT NULL,
  "requires_account" boolean DEFAULT false NOT NULL,
  "region_info" text,
  "is_verified" boolean DEFAULT false NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "allows_embed" boolean DEFAULT false NOT NULL,
  "origin" "watch_source_origin" DEFAULT 'MANUAL' NOT NULL,
  "origin_url" text,
  "discovered_at" timestamp with time zone,
  "last_health_check_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "watch_sources_domain_key" ON "watch_sources" ("domain");
CREATE INDEX IF NOT EXISTS "watch_sources_enabled_idx" ON "watch_sources" ("is_enabled", "source_type");
CREATE INDEX IF NOT EXISTS "watch_sources_type_idx" ON "watch_sources" ("source_type");

CREATE TABLE IF NOT EXISTS "media_watch_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "watch_source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "content_key" text NOT NULL,
  "media_type" "media_type" NOT NULL,
  "provider" "media_provider",
  "provider_media_id" text,
  "canonical_media_key" text,
  "quality" "watch_quality" DEFAULT 'UNKNOWN' NOT NULL,
  "audio" "watch_audio" DEFAULT 'UNKNOWN' NOT NULL,
  "sub_available" boolean,
  "dub_available" boolean,
  "price_label" text,
  "availability_url" text NOT NULL,
  "availability_status" "watch_availability_status" DEFAULT 'UNKNOWN' NOT NULL,
  "last_checked_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_watch_sources_content_source_key"
  ON "media_watch_sources" ("content_key", "watch_source_id");
CREATE INDEX IF NOT EXISTS "media_watch_sources_content_idx"
  ON "media_watch_sources" ("content_key", "media_type");
CREATE INDEX IF NOT EXISTS "media_watch_sources_source_idx"
  ON "media_watch_sources" ("watch_source_id");
CREATE INDEX IF NOT EXISTS "media_watch_sources_stale_idx"
  ON "media_watch_sources" ("last_checked_at");

CREATE TABLE IF NOT EXISTS "watch_source_candidates" (
  "id" text PRIMARY KEY NOT NULL,
  "domain" text NOT NULL,
  "suggested_name" text NOT NULL,
  "homepage_url" text NOT NULL,
  "origin" "watch_source_origin" DEFAULT 'COMMUNITY' NOT NULL,
  "origin_url" text,
  "submitted_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "watch_candidate_status" DEFAULT 'PENDING' NOT NULL,
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "promoted_source_id" text REFERENCES "watch_sources"("id") ON DELETE SET NULL,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "watch_candidates_domain_key" ON "watch_source_candidates" ("domain");
CREATE INDEX IF NOT EXISTS "watch_candidates_status_idx" ON "watch_source_candidates" ("status", "discovered_at");

CREATE TABLE IF NOT EXISTS "watch_source_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "media_watch_source_id" text NOT NULL REFERENCES "media_watch_sources"("id") ON DELETE CASCADE,
  "reported_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" "watch_report_reason" NOT NULL,
  "details" text,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "watch_reports_listing_idx"
  ON "watch_source_reports" ("media_watch_source_id", "created_at");
CREATE INDEX IF NOT EXISTS "watch_reports_open_idx" ON "watch_source_reports" ("resolved_at");
CREATE UNIQUE INDEX IF NOT EXISTS "watch_reports_reporter_key"
  ON "watch_source_reports" ("media_watch_source_id", "reported_by_user_id")
  WHERE "resolved_at" IS NULL AND "reported_by_user_id" IS NOT NULL;
