ALTER TABLE "media_watch_sources"
  ADD COLUMN IF NOT EXISTS "access_type" "watch_access_type" DEFAULT 'UNKNOWN' NOT NULL;

UPDATE "media_watch_sources" AS mws
SET "access_type" = ws."access_type"
FROM "watch_sources" AS ws
WHERE mws."watch_source_id" = ws."id"
  AND mws."access_type" = 'UNKNOWN'
  AND ws."access_type" <> 'UNKNOWN';

-- Force existing TMDB rows through the corrected one-chooser refresh model.
UPDATE "media_watch_sources"
SET "last_checked_at" = NULL
WHERE "provider" = 'TMDB';
