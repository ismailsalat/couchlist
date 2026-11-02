-- What happened the last time we looked at a source's address.
--
-- A link directory rots quietly. Sites in this corner of the web move and
-- disappear often, and nothing in the product noticed: a dead source kept its
-- votes and its place at the top of the list until somebody bothered to
-- report it. These columns are what a scheduled check writes down.
--
-- `health_failures` counts *consecutive* failures rather than total, because
-- one timeout is weather and three in a row is a dead site. It resets to zero
-- on any success, so a flaky host does not accumulate its way to being
-- flagged over a year.
--
-- Nothing here changes what a reader sees on its own. A flag puts a source in
-- front of a moderator; a person decides. An automatic hide would mean one
-- bad afternoon on somebody else's server could remove a good listing.

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "health_status" text;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "health_status_code" integer;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "health_failures" integer NOT NULL DEFAULT 0;

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "health_detail" text;

ALTER TABLE "watch_sources" DROP CONSTRAINT IF EXISTS "watch_sources_health_status_check";
ALTER TABLE "watch_sources"
  ADD CONSTRAINT "watch_sources_health_status_check"
  CHECK (
    "health_status" IS NULL
    OR "health_status" IN ('OK', 'MOVED', 'ERROR', 'UNREACHABLE', 'REFUSED')
  );

ALTER TABLE "watch_sources" DROP CONSTRAINT IF EXISTS "watch_sources_health_failures_check";
ALTER TABLE "watch_sources"
  ADD CONSTRAINT "watch_sources_health_failures_check"
  CHECK ("health_failures" >= 0);

-- The checker asks for the least recently checked sources every time it runs,
-- so that ordering is the one query it makes on every pass.
CREATE INDEX IF NOT EXISTS "watch_sources_health_due_idx"
  ON "watch_sources" ("last_health_check_at" NULLS FIRST)
  WHERE "is_enabled" = true;

-- The admin "needs attention" list reads this.
CREATE INDEX IF NOT EXISTS "watch_sources_health_failing_idx"
  ON "watch_sources" ("health_failures")
  WHERE "health_failures" > 0;
