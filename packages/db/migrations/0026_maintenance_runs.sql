-- Record every maintenance pass, so a failing schedule looks different from
-- one that has never run.
--
-- Without this the status page cannot tell those apart: both leave every
-- source "not checked yet" and both read as "No check has run yet", which is
-- how a broken job hides in plain sight for a month.
CREATE TABLE IF NOT EXISTS "maintenance_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "job" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "ok" boolean DEFAULT false NOT NULL,
  "detail" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maintenance_runs_job_idx" ON "maintenance_runs" ("job","started_at");
