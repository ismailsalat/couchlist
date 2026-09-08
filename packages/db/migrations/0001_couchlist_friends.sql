CREATE TYPE "public"."friendship_status" AS ENUM('PENDING', 'ACCEPTED');--> statement-breakpoint
CREATE TABLE "friendships" (
  "id" text PRIMARY KEY NOT NULL,
  "user_a_id" text NOT NULL,
  "user_b_id" text NOT NULL,
  "requested_by_user_id" text NOT NULL,
  "status" "friendship_status" DEFAULT 'PENDING' NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "friendships_order_check" CHECK ("user_a_id" < "user_b_id"),
  CONSTRAINT "friendships_requester_check" CHECK ("requested_by_user_id" = "user_a_id" OR "requested_by_user_id" = "user_b_id")
);--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_key" ON "friendships" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "friendships_user_a_idx" ON "friendships" USING btree ("user_a_id","status");--> statement-breakpoint
CREATE INDEX "friendships_user_b_idx" ON "friendships" USING btree ("user_b_id","status");
