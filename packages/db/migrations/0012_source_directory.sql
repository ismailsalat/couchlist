-- The community source directory.
--
-- Builds on the existing watch_sources registry rather than creating a parallel
-- set of entities. Nothing is dropped; the like/dislike table is backfilled
-- from the health votes that already exist.

-- 1. Source fields the directory needs ------------------------------------
ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "icon_url" text,
  -- The one approved warning. Set by a moderator, not by vote count.
  ADD COLUMN IF NOT EXISTS "has_lots_of_ads" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_manga" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_manhwa" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_comics" boolean DEFAULT false NOT NULL,
  -- Hides are reversible, so the reason and the moment are kept.
  ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "hidden_reason" text,
  ADD COLUMN IF NOT EXISTS "links_reviewed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "watch_sources_category_idx"
  ON "watch_sources" ("is_enabled", "supports_anime", "supports_movies", "supports_tv", "supports_manga", "supports_manhwa", "supports_comics");

-- 2. Like / dislike feedback ----------------------------------------------
CREATE TYPE "source_vote_value" AS ENUM ('LIKE', 'DISLIKE');

CREATE TABLE IF NOT EXISTS "source_votes" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "value" "source_vote_value" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One vote per account per source. The guarantee lives here, so two concurrent
-- requests cannot both insert.
CREATE UNIQUE INDEX IF NOT EXISTS "source_votes_user_source_key"
  ON "source_votes" ("source_id", "user_id");
CREATE INDEX IF NOT EXISTS "source_votes_source_idx" ON "source_votes" ("source_id", "value");

-- Carry the existing global reliability votes across: a source that worked for
-- someone is the closest honest equivalent of a like. Server-scoped votes
-- (guild_id IS NOT NULL) are left alone because they belonged to a Discord
-- community, not to the public directory.
INSERT INTO "source_votes" ("id", "source_id", "user_id", "value", "created_at", "updated_at")
SELECT
  -- gen_random_uuid() is built in from PostgreSQL 13, so the backfill does
  -- not require the pgcrypto extension being installed on the target database.
  'svt_' || replace(gen_random_uuid()::text, '-', ''),
  v."watch_source_id",
  v."user_id",
  CASE WHEN v."status" = 'WORKING' THEN 'LIKE'::"source_vote_value" ELSE 'DISLIKE'::"source_vote_value" END,
  v."created_at",
  v."updated_at"
FROM "watch_source_health_votes" v
WHERE v."watch_source_id" IS NOT NULL
  AND v."guild_id" IS NULL
ON CONFLICT ("source_id", "user_id") DO NOTHING;

-- 3. Saved sources, with a private note -----------------------------------
CREATE TABLE IF NOT EXISTS "source_bookmarks" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- Visible only to the owner. Never included in a public response shape.
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "source_bookmarks_user_source_key"
  ON "source_bookmarks" ("source_id", "user_id");
CREATE INDEX IF NOT EXISTS "source_bookmarks_user_idx"
  ON "source_bookmarks" ("user_id", "created_at");

-- 4. Contributions and public credit --------------------------------------
CREATE TYPE "credit_mode" AS ENUM ('CREDITED', 'ANONYMOUS');
CREATE TYPE "contribution_kind" AS ENUM ('NEW_SOURCE', 'CORRECTION', 'GUIDE', 'GUIDE_CORRECTION');

CREATE TABLE IF NOT EXISTS "source_contributions" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "guide_id" text,
  -- Kept for moderation even when the public display is Anonymous. Set null on
  -- account deletion so the credit survives without the identity.
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" "contribution_kind" NOT NULL,
  -- The contributor's public display choice. Changeable later by its owner.
  "credit_mode" "credit_mode" NOT NULL DEFAULT 'CREDITED',
  -- True for the first approved suggestion of a source: the original
  -- contributor. Later approved corrections are credited separately and never
  -- replace this row.
  "is_original" boolean DEFAULT false NOT NULL,
  "summary" text,
  "candidate_id" text REFERENCES "watch_source_candidates"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "source_contributions_source_idx"
  ON "source_contributions" ("source_id", "created_at");
CREATE INDEX IF NOT EXISTS "source_contributions_user_idx"
  ON "source_contributions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "source_contributions_guide_idx"
  ON "source_contributions" ("guide_id", "created_at");
-- At most one original contributor per source.
CREATE UNIQUE INDEX IF NOT EXISTS "source_contributions_original_key"
  ON "source_contributions" ("source_id") WHERE "is_original";

-- 5. Approved change history ----------------------------------------------
CREATE TABLE IF NOT EXISTS "source_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "contribution_id" text REFERENCES "source_contributions"("id") ON DELETE SET NULL,
  "summary" text NOT NULL,
  "changed_fields" jsonb,
  "applied_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "source_revisions_source_idx"
  ON "source_revisions" ("source_id", "created_at");

-- 6. Suggestions become suggestions, corrections and reports --------------
ALTER TABLE "watch_source_candidates"
  ADD COLUMN IF NOT EXISTS "kind" "contribution_kind" DEFAULT 'NEW_SOURCE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "credit_mode" "credit_mode" DEFAULT 'CREDITED' NOT NULL,
  -- Set for a correction: the source being corrected.
  ADD COLUMN IF NOT EXISTS "target_source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "supports_manga" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_manhwa" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "supports_comics" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "description" text,
  -- A correction proposes replacements. Null means "leave this field alone".
  ADD COLUMN IF NOT EXISTS "proposed_name" text,
  ADD COLUMN IF NOT EXISTS "proposed_url" text,
  ADD COLUMN IF NOT EXISTS "proposed_description" text,
  ADD COLUMN IF NOT EXISTS "proposed_categories" jsonb,
  ADD COLUMN IF NOT EXISTS "proposed_has_lots_of_ads" boolean;

-- The old index made a domain unique across all time, so a rejected domain
-- could never be suggested again and a correction could not reference an
-- already-listed domain. Replace it with the rule that actually matters:
-- one pending new-source suggestion per domain. Existing rows are untouched.
DROP INDEX IF EXISTS "watch_candidates_domain_key";
CREATE UNIQUE INDEX IF NOT EXISTS "watch_candidates_pending_domain_key"
  ON "watch_source_candidates" ("domain")
  WHERE "status" = 'PENDING' AND "kind" = 'NEW_SOURCE';
CREATE INDEX IF NOT EXISTS "watch_candidates_kind_idx"
  ON "watch_source_candidates" ("kind", "status", "created_at");
CREATE INDEX IF NOT EXISTS "watch_candidates_submitter_idx"
  ON "watch_source_candidates" ("submitted_by_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "watch_candidates_target_idx"
  ON "watch_source_candidates" ("target_source_id", "status");

-- A correction must say what it corrects; a new source must not.
DO $$ BEGIN
  ALTER TABLE "watch_source_candidates"
    ADD CONSTRAINT "watch_candidates_correction_target_check"
    CHECK (
      ("kind" <> 'CORRECTION' AND "kind" <> 'GUIDE_CORRECTION')
      OR "target_source_id" IS NOT NULL
      OR "kind" = 'GUIDE_CORRECTION'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 7. Reports gain a resolution note ---------------------------------------
ALTER TABLE "watch_source_reports"
  ADD COLUMN IF NOT EXISTS "resolution_note" text;
