-- The Guides hub.
--
-- Guide content is data, not code: compatibility, pricing and links change, and
-- a moderator must be able to correct them without a deploy.

CREATE TYPE "guide_topic" AS ENUM (
  'BLOCKING',
  'WATCHING',
  'READING',
  'TRANSLATION',
  'SUBTITLES',
  'CASTING',
  'FIXES'
);

CREATE TABLE IF NOT EXISTS "guides" (
  "id" text PRIMARY KEY NOT NULL,
  -- Stable, shareable URL segment.
  "slug" text NOT NULL,
  -- The task, in the reader's words ("Block ads in Firefox").
  "title" text NOT NULL,
  -- The tool and scope ("uBlock Origin - Desktop and Android").
  "task" text NOT NULL,
  "topic" "guide_topic" NOT NULL,
  "summary" text NOT NULL,
  -- Ordered plain steps. A guide is instructions, not an SEO article.
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  -- [{ label, url }]. Official project or store pages only.
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,
  -- Honest limitations: what the tool does not do.
  "note" text,
  "cost_note" text,
  -- Browser support is the fact that goes stale fastest, so it is its own
  -- editable field rather than being buried in prose.
  "browser_notes" text,

  -- Device support, one column each so filtering is a plain indexed query.
  "device_computer" boolean DEFAULT false NOT NULL,
  "device_iphone" boolean DEFAULT false NOT NULL,
  "device_android" boolean DEFAULT false NOT NULL,
  "device_tv" boolean DEFAULT false NOT NULL,
  -- Short human label for the row ("PC / Android").
  "device_label" text NOT NULL DEFAULT '',

  -- Extra search terms, including common misspellings.
  "keywords" text DEFAULT '' NOT NULL,
  -- Appears in the Start here selection.
  "is_starter" boolean DEFAULT false NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,

  -- Null until a human actually checked the links and claims. The UI shows a
  -- reviewed date only when this is set.
  "last_reviewed_at" timestamp with time zone,
  "last_reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "guides_slug_key" ON "guides" ("slug");
CREATE INDEX IF NOT EXISTS "guides_topic_idx" ON "guides" ("topic", "is_published", "sort_order");
CREATE INDEX IF NOT EXISTS "guides_starter_idx" ON "guides" ("is_starter", "is_published");

-- source_contributions.guide_id can now be checked.
DO $$ BEGIN
  ALTER TABLE "source_contributions"
    ADD CONSTRAINT "source_contributions_guide_fk"
    FOREIGN KEY ("guide_id") REFERENCES "guides"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- A contribution belongs to a source or a guide, not to neither.
DO $$ BEGIN
  ALTER TABLE "source_contributions"
    ADD CONSTRAINT "source_contributions_target_check"
    CHECK (("source_id" IS NOT NULL)::int + ("guide_id" IS NOT NULL)::int = 1);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Community guide submissions, corrections and broken-link reports.
CREATE TYPE "guide_suggestion_kind" AS ENUM ('NEW_GUIDE', 'CORRECTION', 'BROKEN_LINK');

CREATE TABLE IF NOT EXISTS "guide_suggestions" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" "guide_suggestion_kind" NOT NULL,
  -- Set for a correction or report; null for a brand-new guide.
  "target_guide_id" text REFERENCES "guides"("id") ON DELETE CASCADE,
  "submitted_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "credit_mode" "credit_mode" NOT NULL DEFAULT 'CREDITED',

  "title" text,
  "topic" "guide_topic",
  "body" text NOT NULL,
  "links" jsonb DEFAULT '[]'::jsonb NOT NULL,

  "status" "watch_candidate_status" NOT NULL DEFAULT 'PENDING',
  "reviewed_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_notes" text,
  "promoted_guide_id" text REFERENCES "guides"("id") ON DELETE SET NULL,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "guide_suggestions_status_idx"
  ON "guide_suggestions" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "guide_suggestions_submitter_idx"
  ON "guide_suggestions" ("submitted_by_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "guide_suggestions_target_idx"
  ON "guide_suggestions" ("target_guide_id", "status");

DO $$ BEGIN
  ALTER TABLE "guide_suggestions"
    ADD CONSTRAINT "guide_suggestions_target_check"
    CHECK ("kind" = 'NEW_GUIDE' OR "target_guide_id" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;
