-- A picture of what a listed site looks like.
--
-- Stored in `source_icons` with the rest of the validated images rather than
-- in a table of its own: one pipeline for every image a stranger can put in
-- front of a reader means one place to get the checks right, instead of two
-- places to get them subtly different.
--
-- What a preview is NOT: an automated screenshot of somebody's page. A
-- preview here is either the share image the site itself publishes for this
-- purpose, or one a moderator chose. Both are deliberate, and both keep
-- Couchlist's "it lists, it does not host" claim honest.

ALTER TABLE "source_icons" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'ICON';

ALTER TABLE "source_icons" DROP CONSTRAINT IF EXISTS "source_icons_kind_check";
ALTER TABLE "source_icons"
  ADD CONSTRAINT "source_icons_kind_check"
  CHECK ("kind" IN ('ICON', 'PREVIEW'));

-- Where the picture came from, so the listing can say so: a reader deserves
-- to know whether they are looking at the site's own artwork or a moderator's
-- choice.
ALTER TABLE "source_icons" ADD COLUMN IF NOT EXISTS "source_note" text;

-- A listing may now have one icon and one preview, so the old "one image per
-- source" index has to become "one image per source per kind".
DROP INDEX IF EXISTS "source_icons_source_key";
CREATE UNIQUE INDEX IF NOT EXISTS "source_icons_source_kind_key"
  ON "source_icons" ("source_id", "kind")
  WHERE "source_id" IS NOT NULL;

-- Mirrors the icon arrangement: the type lives on the parent row, so the
-- directory knows whether a preview exists without touching the bytes.
ALTER TABLE "watch_sources" ADD COLUMN IF NOT EXISTS "preview_mime" text;
