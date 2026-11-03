-- Screenshots wait for a person.
--
-- A bot that visits a listed site and photographs whatever is on its homepage
-- will, sooner or later, photograph something nobody wants on Couchlist: an
-- advert, an interstitial, a page that changed hands. Publishing that
-- automatically would mean the first person to see it is a reader.
--
-- So an image has an `approved` flag. Everything a person chose is approved on
-- arrival; everything a bot captured is not, and waits in a queue.

ALTER TABLE "source_icons" ADD COLUMN IF NOT EXISTS "approved" boolean NOT NULL DEFAULT true;

-- Where a capture came from and when, so the review queue can say "taken on
-- Tuesday from example.com" rather than showing a picture with no provenance.
ALTER TABLE "source_icons" ADD COLUMN IF NOT EXISTS "captured_from" text;

-- The review queue reads exactly this.
CREATE INDEX IF NOT EXISTS "source_icons_pending_idx"
  ON "source_icons" ("created_at")
  WHERE "approved" = false;

-- A listing's `preview_mime` means "a reader can see a preview", so an
-- unapproved capture must not set it. Nothing to backfill: every image that
-- exists today was put there by a person.
