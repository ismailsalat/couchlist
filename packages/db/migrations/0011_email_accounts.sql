-- Email accounts.
--
-- Additive only. Discord columns stay, existing rows keep their discord_id, and
-- no account is merged or rewritten: an old Discord row and a new email row are
-- separate accounts until a human links them deliberately.

ALTER TABLE "users"
  ALTER COLUMN "discord_id" DROP NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email" text,
  ADD COLUMN IF NOT EXISTS "password_hash" text,
  ADD COLUMN IF NOT EXISTS "display_name" text,
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

-- Legacy rows get a display name from what Discord already gave us, so
-- contributor credit keeps working for accounts created before email signup.
UPDATE "users"
   SET "display_name" = COALESCE("global_name", "username")
 WHERE "display_name" IS NULL;

-- Email is stored once, lowercased, so two spellings cannot both register.
-- Partial so legacy Discord-only rows (email IS NULL) do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"
  ON "users" (lower("email")) WHERE "email" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "users_admin_idx" ON "users" ("is_admin") WHERE "is_admin";

-- An account must be reachable one way or the other.
DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_identity_check"
    CHECK ("discord_id" IS NOT NULL OR "email" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Email verification codes and password-reset tokens.
--
-- One table, so expiry, single-use and attempt limiting have exactly one
-- implementation. Only a hash is stored: a database dump cannot be replayed to
-- verify an address or take over an account.
CREATE TYPE "auth_token_purpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" "auth_token_purpose" NOT NULL,
  "token_hash" text NOT NULL,
  -- The address the code was sent to. A code issued for one address must not
  -- verify a different one after an email change.
  "sent_to_email" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_key" ON "auth_tokens" ("purpose", "token_hash");
CREATE INDEX IF NOT EXISTS "auth_tokens_user_idx" ON "auth_tokens" ("user_id", "purpose", "created_at");
CREATE INDEX IF NOT EXISTS "auth_tokens_expiry_idx" ON "auth_tokens" ("expires_at");
