ALTER TABLE "watch_sources"
  ADD COLUMN IF NOT EXISTS "admin_rank_penalty" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "admin_health_override" text;

DO $$ BEGIN
  ALTER TABLE "watch_sources"
    ADD CONSTRAINT "watch_sources_admin_rank_penalty_check"
    CHECK ("admin_rank_penalty" between 0 and 100);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "watch_sources"
    ADD CONSTRAINT "watch_sources_admin_health_override_check"
    CHECK ("admin_health_override" is null or "admin_health_override" in ('WORKING', 'DEGRADED', 'DOWN'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
