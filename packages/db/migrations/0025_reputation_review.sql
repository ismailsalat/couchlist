-- An admin's "we looked, and we disagree" on a reputation flag.
--
-- Public blocklists are evidence, not verdicts, and they are maintained by
-- people who have never heard of this directory. Without this, one entry on a
-- community list overrides a source a moderator vetted, and Couchlist spends
-- its time arguing against its own catalogue.
--
-- `reviewed_sources` is the point of the design. A review covers only the
-- lists that were flagging the domain when it was made. If a *different*
-- provider flags it later, that is new evidence the moderator never saw, and
-- the warning comes back. A blanket "ignore all warnings forever" flag would
-- be the easy version and a bad one.

ALTER TABLE watch_sources
  ADD COLUMN IF NOT EXISTS reputation_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reputation_reviewed_by_user_id text,
  ADD COLUMN IF NOT EXISTS reputation_review_note text,
  ADD COLUMN IF NOT EXISTS reputation_reviewed_sources jsonb;

-- A review must say who made it and what it covered, or it is not a review.
ALTER TABLE watch_sources
  DROP CONSTRAINT IF EXISTS watch_sources_reputation_review_check;
ALTER TABLE watch_sources
  ADD CONSTRAINT watch_sources_reputation_review_check CHECK (
    reputation_reviewed_at IS NULL
    OR (reputation_reviewed_by_user_id IS NOT NULL AND reputation_reviewed_sources IS NOT NULL)
  );
