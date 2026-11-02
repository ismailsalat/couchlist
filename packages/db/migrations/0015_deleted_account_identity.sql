-- Allow a deleted account to have no identifier.
--
-- 0011 required every users row to carry a discord_id or an email. That is
-- right for a live account, but a soft-deleted one deliberately clears both:
-- the row survives only so contribution credit and moderation history do not
-- develop holes, and keeping an address on it would defeat the deletion.
--
-- Without this, deleting an account fails against the check constraint.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_identity_check";

DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_identity_check"
    CHECK (
      "deleted_at" IS NOT NULL
      OR "discord_id" IS NOT NULL
      OR "email" IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
