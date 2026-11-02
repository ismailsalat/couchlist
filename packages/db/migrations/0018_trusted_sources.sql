-- Moderator-picked trusted sources.
--
-- The directory is ordered by a confidence-weighted score, which is right for
-- the general case and wrong for the handful of places a moderator knows are
-- good. A new listing with two votes cannot climb past an established one on
-- merit alone, however obviously it belongs at the top.
--
-- `trusted_rank` answers that. NULL means "not picked" and the usual ranking
-- applies. A number pins the source above everything unpicked, ordered by
-- that number ascending, so the order of the picks is chosen rather than
-- accidental. `trusted_note` says why, in the moderator's words.
--
-- Deliberately separate from `admin_rank_penalty`: a penalty nudges, this
-- overrides, and conflating the two would make either hard to reason about.

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "trusted_rank" integer;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "trusted_note" text;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "trusted_at" timestamptz;

-- A sane range, enforced here so no caller has to remember it.
ALTER TABLE "watch_sources" DROP CONSTRAINT IF EXISTS "watch_sources_trusted_rank_check";
ALTER TABLE "watch_sources"
  ADD CONSTRAINT "watch_sources_trusted_rank_check"
  CHECK ("trusted_rank" IS NULL OR ("trusted_rank" >= 0 AND "trusted_rank" <= 9999));

-- The directory reads "trusted first" on every page, so it gets its own index.
CREATE INDEX IF NOT EXISTS "watch_sources_trusted_idx"
  ON "watch_sources" ("trusted_rank")
  WHERE "trusted_rank" IS NOT NULL;
