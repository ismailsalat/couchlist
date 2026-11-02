-- Source collections: a named, optionally public list of sources.
--
-- Phase-two feature. Private by default; a private collection is never
-- included in a public response.

CREATE TABLE IF NOT EXISTS "source_collections" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "is_public" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Slugs are unique per owner, so two people can both have "weekend-movies".
CREATE UNIQUE INDEX IF NOT EXISTS "source_collections_owner_slug_key"
  ON "source_collections" ("owner_user_id", "slug");
CREATE INDEX IF NOT EXISTS "source_collections_public_idx"
  ON "source_collections" ("is_public", "updated_at");

CREATE TABLE IF NOT EXISTS "source_collection_items" (
  "id" text PRIMARY KEY NOT NULL,
  "collection_id" text NOT NULL REFERENCES "source_collections"("id") ON DELETE CASCADE,
  "source_id" text NOT NULL REFERENCES "watch_sources"("id") ON DELETE CASCADE,
  "note" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "source_collection_items_key"
  ON "source_collection_items" ("collection_id", "source_id");
CREATE INDEX IF NOT EXISTS "source_collection_items_order_idx"
  ON "source_collection_items" ("collection_id", "position");
