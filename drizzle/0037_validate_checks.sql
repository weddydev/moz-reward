-- P1-18 phase hardening (FOLLOWUPS: "VALIDATE CONSTRAINT it in a later migration"): every CHECK added NOT VALID in
-- 0009, 0015, 0020, 0025, 0029, 0033, 0034 and 0035 is validated, so existing rows are proven too (new rows were
-- already checked on every write). VALIDATE takes SHARE UPDATE EXCLUSIVE: reads and writes go on while it scans.
-- Before deploying, count the failing rows on the target database (RUNBOOK §4, P1-18 note): a row that fails
-- makes this migration fail, and the deploy keeps the previous release.
-- contract: none needed (validation only; no column, type or behaviour changes).
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "outbox" VALIDATE CONSTRAINT "outbox_scope_kind";--> statement-breakpoint
ALTER TABLE "shops" VALIDATE CONSTRAINT "shops_phone_e164";--> statement-breakpoint
ALTER TABLE "customer_profiles" VALIDATE CONSTRAINT "customer_profiles_phone_sealed";--> statement-breakpoint
ALTER TABLE "customer_profiles" VALIDATE CONSTRAINT "customer_profiles_full_name_length";--> statement-breakpoint
ALTER TABLE "memberships" VALIDATE CONSTRAINT "memberships_progress_gold_non_negative";--> statement-breakpoint
ALTER TABLE "memberships" VALIDATE CONSTRAINT "memberships_ingots_completed_non_negative";--> statement-breakpoint
ALTER TABLE "memberships" VALIDATE CONSTRAINT "memberships_gold_shortfall_non_negative";--> statement-breakpoint
ALTER TABLE "memberships" VALIDATE CONSTRAINT "memberships_streak_weeks_non_negative";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_amount_positive";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_award_gold_positive";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_items_shape";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_reject_note_length";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_rejected_has_reason";--> statement-breakpoint
ALTER TABLE "point_requests" VALIDATE CONSTRAINT "point_requests_celebration_shape";--> statement-breakpoint
ALTER TABLE "loyalty_programs" VALIDATE CONSTRAINT "loyalty_programs_reward_valid_days_range";--> statement-breakpoint
ALTER TABLE "rewards" VALIDATE CONSTRAINT "rewards_redeemed_after_unlock";--> statement-breakpoint
ALTER TABLE "ledger_entries" VALIDATE CONSTRAINT "ledger_entries_ref_shape";
