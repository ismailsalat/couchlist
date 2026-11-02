-- Two additions, both purely additive.
--
-- 1. A stronger warning than "lots of ads".
--
--    `has_lots_of_ads` is a caution: the site works, it is just unpleasant.
--    Some sites deserve more than that — a moderator wants to list them so
--    people recognise the name, while saying plainly that going there is a bad
--    idea. That is a different message, so it gets its own column rather than
--    overloading the ad flag, and an optional note saying why.
--
-- 2. Profile pictures, stored the same way as site icons.
--
--    `source_icons` already holds validated image bytes. Rather than a second
--    table with the same shape and the same mistakes to make, it gains a
--    `user_id` target alongside `source_id` and `candidate_id`. Exactly one of
--    the three is set, which the check constraint enforces.

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "avoid_reason" text;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "should_avoid" boolean NOT NULL DEFAULT false;

-- A correction may propose turning the stronger warning on or off, the same
-- way it may already propose the ad warning. Null means "no opinion".
ALTER TABLE "watch_source_candidates"
  ADD COLUMN IF NOT EXISTS "proposed_should_avoid" boolean;

-- Avatars reuse the validated-image table.
ALTER TABLE "source_icons"
  ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "users"("id") ON DELETE CASCADE;

-- One image per account.
CREATE UNIQUE INDEX IF NOT EXISTS "source_icons_user_key"
  ON "source_icons" ("user_id")
  WHERE "user_id" IS NOT NULL;

-- Exactly one owner. Replaces the two-way constraint from 0016.
ALTER TABLE "source_icons" DROP CONSTRAINT IF EXISTS "source_icons_target_check";
ALTER TABLE "source_icons"
  ADD CONSTRAINT "source_icons_target_check" CHECK (
    (CASE WHEN "source_id" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "candidate_id" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "user_id" IS NULL THEN 0 ELSE 1 END)
  = 1
  );

-- Mirrors `icon_mime` on sources: the type is on the row, so "does this
-- account have a picture" costs no join and no bytes.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar_mime" text;
