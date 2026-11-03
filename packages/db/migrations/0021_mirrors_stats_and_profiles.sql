-- Mirrors, soft deletes, an aggregate visit counter, the survey, and bios.
--
-- Additive and forward-only, like every migration here. Nothing is backfilled
-- that changes what a reader sees: existing listings get one mirror row each
-- (their own domain, marked primary) because that is simply a restatement of
-- what is already true, and every new column starts at a value that means
-- "nothing has happened yet".

-- ---------------------------------------------------------------------------
-- Mirrors
--
-- Sites in this directory change domain often, and when they do the listing
-- used to die with the address: votes, credit and the description all thrown
-- away to re-add the same site under a new name. A listing is a site, and a
-- domain is one of the places that site currently answers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "watch_source_domains" (
  "id" text PRIMARY KEY,
  "watch_source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "homepage_url" text NOT NULL,
  -- The one shown on the listing and used by the link checker.
  "is_primary" boolean NOT NULL DEFAULT false,
  -- A mirror the checker proposed from a redirect, not yet accepted by a
  -- person. Proposed mirrors are never shown publicly.
  "is_confirmed" boolean NOT NULL DEFAULT true,
  "note" text,
  "added_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- One listing per domain across the whole table: two listings claiming the
-- same address is the ambiguity this feature exists to remove.
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_domains_domain_key"
  ON "watch_source_domains" ("domain");

CREATE INDEX IF NOT EXISTS "watch_source_domains_source_idx"
  ON "watch_source_domains" ("watch_source_id");

-- At most one primary per listing.
CREATE UNIQUE INDEX IF NOT EXISTS "watch_source_domains_primary_key"
  ON "watch_source_domains" ("watch_source_id")
  WHERE "is_primary" = true;

-- Every existing listing already has exactly one address. Recording it here
-- means the rest of the code can read mirrors without special-casing the
-- listings that predate this table.
INSERT INTO "watch_source_domains"
  ("id", "watch_source_id", "domain", "homepage_url", "is_primary", "is_confirmed")
SELECT
  'wsd_' || substr(md5(random()::text || s."id"), 1, 20),
  s."id",
  s."domain",
  s."homepage_url",
  true,
  true
FROM "watch_sources" s
WHERE NOT EXISTS (
  SELECT 1 FROM "watch_source_domains" d WHERE d."watch_source_id" = s."id"
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Deleting, reversibly
--
-- Bulk delete is one button away from removing forty listings and the votes,
-- saves and credit attached to them. A window to change your mind costs one
-- column and is the difference between a mistake and a disaster.
-- ---------------------------------------------------------------------------
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" text
  REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "deleted_reason" text;

-- Every public query filters on this, so it is worth an index of its own.
CREATE INDEX IF NOT EXISTS "watch_sources_deleted_idx"
  ON "watch_sources" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Visits, counted and nothing more
--
-- A single integer per listing. No account, no address, no session, no
-- timestamp finer than the day the total was last touched. It can answer
-- "which sites do people actually open" and it cannot answer "what did this
-- person open", which is the whole point.
-- ---------------------------------------------------------------------------
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "visit_count" bigint NOT NULL DEFAULT 0;
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "visit_counted_on" date;

ALTER TABLE "watch_sources" DROP CONSTRAINT IF EXISTS "watch_sources_visit_count_check";
ALTER TABLE "watch_sources"
  ADD CONSTRAINT "watch_sources_visit_count_check"
  CHECK ("visit_count" >= 0);

CREATE INDEX IF NOT EXISTS "watch_sources_visit_count_idx"
  ON "watch_sources" ("visit_count" DESC)
  WHERE "is_enabled" = true;

-- ---------------------------------------------------------------------------
-- The survey
--
-- One row per person, replaced if they answer again, so the table cannot be
-- used to watch somebody change their mind over time. Answering or dismissing
-- both close it for good.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "survey_responses" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ease" integer NOT NULL,
  "uses_ad_blocker" boolean,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "survey_responses_ease_check" CHECK ("ease" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS "survey_responses_user_key"
  ON "survey_responses" ("user_id");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "survey_closed_at" timestamptz;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_bio_length_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_bio_length_check"
  CHECK ("bio" IS NULL OR char_length("bio") <= 160);
