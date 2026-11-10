-- P0-18: transactional outbox (ARCHITECTURE §6). New table only: nothing existing is locked, so its indexes are
-- built here (empty table). moz_app gets DML through the default privileges (0003). No updated_at:
-- every state change has its own column (next_attempt_at, dispatched_at, completed_at, failed_at).
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dispatched_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "outbox_attempts_non_negative" CHECK ("outbox"."attempts" >= 0),
	CONSTRAINT "outbox_payload_small" CHECK (octet_length("outbox"."payload"::text) <= 16384),
	CONSTRAINT "outbox_completed_after_dispatch" CHECK ("outbox"."completed_at" IS NULL OR "outbox"."dispatched_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("created_at","id") WHERE "outbox"."dispatched_at" IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_replay_idx" ON "outbox" USING btree ("dispatched_at","id") WHERE "outbox"."dispatched_at" IS NOT NULL AND "outbox"."completed_at" IS NULL AND "outbox"."failed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_finished_idx" ON "outbox" USING btree (coalesce("completed_at", "failed_at")) WHERE "outbox"."completed_at" IS NOT NULL OR "outbox"."failed_at" IS NOT NULL;