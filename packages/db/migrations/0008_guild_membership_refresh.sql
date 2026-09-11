ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "guilds_synced_at" timestamp with time zone;

-- Existing users get refreshed on their next My Server/server visit. Login also
-- fills this column immediately after the normal OAuth guild sync.
