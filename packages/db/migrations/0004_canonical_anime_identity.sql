ALTER TABLE "media_entries"
  ADD COLUMN IF NOT EXISTS "canonical_media_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "entries_user_canonical_key"
  ON "media_entries" ("user_id", "canonical_media_key")
  WHERE "canonical_media_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "anime_aliases" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" "media_provider" NOT NULL,
  "provider_media_id" text NOT NULL,
  "canonical_media_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "anime_aliases_provider_check" CHECK ("provider" <> 'TMDB')
);

CREATE UNIQUE INDEX IF NOT EXISTS "anime_aliases_provider_key"
  ON "anime_aliases" ("provider", "provider_media_id");

CREATE INDEX IF NOT EXISTS "anime_aliases_canonical_idx"
  ON "anime_aliases" ("canonical_media_key");
