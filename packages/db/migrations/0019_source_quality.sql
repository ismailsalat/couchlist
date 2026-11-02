-- A moderator's note on quality.
--
-- Deliberately a short free-text label rather than an enumeration. The
-- directory covers video and reading sources in one list, and no fixed set of
-- values fits both: "1080p" means nothing for a manga reader and "HQ scans"
-- means nothing for a film site. A dozen characters is enough for every
-- useful answer and too few for a sentence, which is the point.
--
-- Null is the normal state. Most listings will never carry one, and an empty
-- badge on every row would be worse than no badge at all.

ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "quality_label" text;

ALTER TABLE "watch_sources" DROP CONSTRAINT IF EXISTS "watch_sources_quality_label_check";
ALTER TABLE "watch_sources"
  ADD CONSTRAINT "watch_sources_quality_label_check"
  CHECK ("quality_label" IS NULL OR char_length("quality_label") BETWEEN 1 AND 12);
