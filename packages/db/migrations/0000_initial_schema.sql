CREATE TYPE "public"."list_status" AS ENUM('WATCHING', 'COMPLETED', 'PLAN_TO_WATCH');--> statement-breakpoint
CREATE TYPE "public"."media_provider" AS ENUM('ANILIST', 'TMDB');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('ANIME', 'MOVIE', 'TV');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('MUTUAL_SERVERS', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"guild_id" text,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"name" text NOT NULL,
	"icon_url" text,
	"bot_connected" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notifications_enabled" boolean DEFAULT false NOT NULL,
	"announce_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "media_provider" NOT NULL,
	"provider_media_id" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"poster_url" text,
	"banner_url" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "media_provider" NOT NULL,
	"provider_media_id" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"status" "list_status" NOT NULL,
	"rating" double precision,
	"progress" integer,
	"title" text NOT NULL,
	"poster_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"username" text NOT NULL,
	"global_name" text,
	"avatar_url" text,
	"profile_visibility" "profile_visibility" DEFAULT 'MUTUAL_SERVERS' NOT NULL,
	"show_ratings" boolean DEFAULT true NOT NULL,
	"show_progress" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_entries" ADD CONSTRAINT "media_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_guild_idx" ON "audit_logs" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_discord_id_key" ON "discord_guilds" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "guilds_connected_idx" ON "discord_guilds" USING btree ("bot_connected");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_guild_key" ON "guild_memberships" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "memberships_guild_active_idx" ON "guild_memberships" USING btree ("guild_id","is_active");--> statement-breakpoint
CREATE INDEX "memberships_user_active_idx" ON "guild_memberships" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_settings_guild_key" ON "guild_settings" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cache_media_key" ON "media_cache" USING btree ("provider","provider_media_id","media_type");--> statement-breakpoint
CREATE INDEX "cache_expires_idx" ON "media_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_user_media_key" ON "media_entries" USING btree ("user_id","provider","provider_media_id","media_type");--> statement-breakpoint
CREATE INDEX "entries_user_status_idx" ON "media_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "entries_media_idx" ON "media_entries" USING btree ("provider","provider_media_id","media_type");--> statement-breakpoint
CREATE INDEX "entries_user_updated_idx" ON "media_entries" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_id_key" ON "users" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "users_last_seen_idx" ON "users" USING btree ("last_seen_at");