-- P0-04: dead-letter table and scheduled-job heartbeats. moz_app gets DML through the default privileges (0003).
CREATE TABLE "failed_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"job_name" text NOT NULL,
	"job_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"attempts" integer NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "failed_jobs_attempts_positive" CHECK ("failed_jobs"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "failed_jobs_queue_job_uq" ON "failed_jobs" USING btree ("queue","job_id");--> statement-breakpoint
CREATE INDEX "failed_jobs_unresolved_idx" ON "failed_jobs" USING btree ("failed_at") WHERE "failed_jobs"."resolved_at" IS NULL;--> statement-breakpoint
-- set_updated_at() (0003) must be attached to every new table with updated_at.
CREATE TRIGGER failed_jobs_set_updated_at BEFORE UPDATE ON failed_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER job_heartbeats_set_updated_at BEFORE UPDATE ON job_heartbeats FOR EACH ROW EXECUTE FUNCTION set_updated_at();
