-- P1-17 (TESTING §10; ARCHITECTURE §4, §6): data-integrity reconciliation. New: integrity_issues, one open row
-- per (check, entity) (partial unique index), written by the nightly job (moz_worker) only; admins read it (RLS);
-- no other role sees or writes it. The ledger's ref may also carry `ingots` (an opening-balance adjustment row
-- names the ingots completed before the ledger began: the demo seed's counters).
-- contract: none needed (new type, table, index and policy; the ref-shape check is dropped and re-added wider in
-- the same transaction, NOT VALID).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."integrity_check" AS ENUM('membership_counters', 'receipt_numbers', 'reward_redeemed_twice', 'redeem_not_zero', 'request_approved_twice', 'approved_without_ledger', 'approved_without_receipt');--> statement-breakpoint
CREATE TABLE "integrity_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"check" "integrity_check" NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"shop_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "integrity_issues_entity_length" CHECK (char_length("integrity_issues"."entity") BETWEEN 1 AND 40),
	CONSTRAINT "integrity_issues_details_object" CHECK (jsonb_typeof("integrity_issues"."details") = 'object')
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_ref_shape";--> statement-breakpoint
CREATE UNIQUE INDEX "integrity_issues_open_uq" ON "integrity_issues" USING btree ("check","entity_id") WHERE "integrity_issues"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "integrity_issues_detected_idx" ON "integrity_issues" USING btree ("detected_at");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ref_shape" CHECK (jsonb_typeof("ledger_entries"."ref") = 'object'
        AND "ledger_entries"."ref" - ARRAY['receiptId', 'requestId', 'rewardId', 'redemptionId', 'reason', 'multiplierPercent', 'base', 'version', 'ingots'] = '{}'::jsonb) NOT VALID;--> statement-breakpoint
REVOKE ALL ON integrity_issues FROM PUBLIC, moz_auth, moz_app;--> statement-breakpoint
GRANT SELECT ON integrity_issues TO moz_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON integrity_issues FROM moz_worker;--> statement-breakpoint
ALTER TABLE integrity_issues ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE integrity_issues FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY integrity_issues_admin_read ON integrity_issues AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
