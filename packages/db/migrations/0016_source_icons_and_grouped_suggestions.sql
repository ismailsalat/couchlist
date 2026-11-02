-- Site icons, and several suggestions for one website.
--
-- Two changes that go together: a contributor can now attach the site's icon
-- to a suggestion, and several people can suggest the same website without the
-- second one being turned away.

-- 1. Icons -----------------------------------------------------------------
--
-- Stored in the database rather than an object store. The files are tiny and
-- few, and this way the feature needs no storage credential: it works on a
-- laptop and on a fresh deploy with nothing configured. If the directory ever
-- grows large enough for that to hurt, the bytes move to a bucket and the
-- `source_icons` row becomes a pointer.
--
-- The bytes live in their own table so that listing the directory never drags
-- image data along. The *type* lives on the parent row, so a listing knows
-- whether an icon exists without touching this table at all.
CREATE TABLE IF NOT EXISTS "source_icons" (
  "id" text PRIMARY KEY NOT NULL,
  "source_id" text REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "candidate_id" text REFERENCES "watch_source_candidates"("id") ON DELETE CASCADE,

  -- Checked against the file's magic bytes before it is stored, and sent back
  -- as the response's Content-Type with nosniff. SVG is never accepted: it can
  -- carry script.
  "mime" text NOT NULL,
  "bytes" bytea NOT NULL,
  "byte_size" integer NOT NULL,
  "uploaded_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- An icon belongs to a source or to a suggestion, never to neither or both.
DO $$ BEGIN
  ALTER TABLE "source_icons"
    ADD CONSTRAINT "source_icons_target_check"
    CHECK (("source_id" IS NOT NULL)::int + ("candidate_id" IS NOT NULL)::int = 1);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "source_icons"
    ADD CONSTRAINT "source_icons_mime_check"
    CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 256 KiB. Large enough for a crisp icon, small enough that a row is cheap.
DO $$ BEGIN
  ALTER TABLE "source_icons"
    ADD CONSTRAINT "source_icons_size_check"
    CHECK ("byte_size" > 0 AND "byte_size" <= 262144);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "source_icons_source_key"
  ON "source_icons" ("source_id") WHERE "source_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "source_icons_candidate_key"
  ON "source_icons" ("candidate_id") WHERE "candidate_id" IS NOT NULL;

ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "icon_mime" text;
ALTER TABLE "watch_source_candidates" ADD COLUMN IF NOT EXISTS "icon_mime" text;

-- 2. Several suggestions for one website -----------------------------------
--
-- The partial unique index added in 0012 meant the second person to suggest a
-- website was turned away. That throws away a signal — several people wanting
-- the same site is useful — and denies them credit for work they did.
--
-- Now every submission is kept. The admin queue groups them by domain so the
-- decision is still one piece of work, the moderator picks whichever write-up
-- is best, and everyone who suggested it is credited.
DROP INDEX IF EXISTS "watch_candidates_pending_domain_key";

CREATE INDEX IF NOT EXISTS "watch_candidates_pending_domain_idx"
  ON "watch_source_candidates" ("domain")
  WHERE "status" = 'PENDING' AND "kind" = 'NEW_SOURCE';

-- One person cannot suggest the same website twice while it is pending; a
-- second attempt updates their existing one instead of stacking duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "watch_candidates_pending_submitter_key"
  ON "watch_source_candidates" ("domain", "submitted_by_user_id")
  WHERE "status" = 'PENDING' AND "kind" = 'NEW_SOURCE' AND "submitted_by_user_id" IS NOT NULL;
