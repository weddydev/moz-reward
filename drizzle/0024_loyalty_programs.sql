-- P1-05: versioned loyalty programmes (ARCHITECTURE §4, PRODUCT §6). A new, empty table; a save appends a version.
-- Versions are history (the settings page lists them; the engine reads the version an ingot started under), so no
-- role may UPDATE a row (trigger) and the web role may not DELETE one (privilege). Deleting a shop still cascades
-- (worker/owner roles), e.g. the demo reset. `created_by` has no FK (like audit_logs): an erased account can't be
-- nulled out of an immutable row, and the bare id is pseudonymous.
-- RLS: the shop's team reads its own programme (staff need it to approve, P1-12); only the owner inserts, as
-- themself; admins read. Customer and public reads (Wallet, Vault, landing preview) come with the tasks that show
-- them (P1-07/P1-08).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."loyalty_earn_mode" AS ENUM('per_visit', 'per_pound');--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"earn_mode" "loyalty_earn_mode" NOT NULL,
	"earn_rate" integer NOT NULL,
	"ingot_size" integer NOT NULL,
	"main_reward" jsonb NOT NULL,
	"milestones" jsonb NOT NULL,
	"streak" jsonb,
	"tiers" jsonb NOT NULL,
	"expiry_months" smallint,
	"active_from" timestamp with time zone NOT NULL,
	"rewards_from" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_programs_version_positive" CHECK ("loyalty_programs"."version" >= 1),
	CONSTRAINT "loyalty_programs_earn_rate_range" CHECK (("loyalty_programs"."earn_mode" = 'per_visit' AND "loyalty_programs"."earn_rate" BETWEEN 1 AND 500) OR ("loyalty_programs"."earn_mode" = 'per_pound' AND "loyalty_programs"."earn_rate" BETWEEN 1 AND 100)),
	CONSTRAINT "loyalty_programs_ingot_size_range" CHECK ("loyalty_programs"."ingot_size" BETWEEN 100 AND 100000),
	CONSTRAINT "loyalty_programs_main_reward_shape" CHECK (jsonb_typeof("loyalty_programs"."main_reward") = 'object' AND jsonb_typeof("loyalty_programs"."main_reward"->'text') = 'string'),
	CONSTRAINT "loyalty_programs_milestones_shape" CHECK (jsonb_typeof("loyalty_programs"."milestones") = 'array' AND jsonb_array_length("loyalty_programs"."milestones") <= 3),
	CONSTRAINT "loyalty_programs_streak_shape" CHECK ("loyalty_programs"."streak" IS NULL OR (jsonb_typeof("loyalty_programs"."streak"->'bonusGold') = 'number' AND ("loyalty_programs"."streak"->>'bonusGold')::numeric BETWEEN 1 AND 500)),
	CONSTRAINT "loyalty_programs_tiers_shape" CHECK (jsonb_typeof("loyalty_programs"."tiers"->'silver') = 'number' AND jsonb_typeof("loyalty_programs"."tiers"->'gold') = 'number' AND ("loyalty_programs"."tiers"->>'silver')::numeric >= 1 AND ("loyalty_programs"."tiers"->>'gold')::numeric > ("loyalty_programs"."tiers"->>'silver')::numeric AND ("loyalty_programs"."tiers"->>'gold')::numeric <= 1000),
	CONSTRAINT "loyalty_programs_expiry_range" CHECK ("loyalty_programs"."expiry_months" IS NULL OR "loyalty_programs"."expiry_months" BETWEEN 12 AND 60),
	CONSTRAINT "loyalty_programs_rewards_after_active" CHECK ("loyalty_programs"."rewards_from" >= "loyalty_programs"."active_from")
);
--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_programs_shop_version_uq" ON "loyalty_programs" USING btree ("shop_id","version");--> statement-breakpoint
-- set_updated_at() (0003) on every table with updated_at; it never fires here because the guard below refuses first.
CREATE TRIGGER loyalty_programs_set_updated_at BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Immutable versions: any UPDATE or TRUNCATE is refused, whoever runs it (reject_mutation, 0003). Row DELETE stays
-- possible for the owner/worker roles so a shop's deletion cascades.
CREATE TRIGGER loyalty_programs_immutable BEFORE UPDATE ON loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE TRIGGER loyalty_programs_no_truncate BEFORE TRUNCATE ON loyalty_programs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON loyalty_programs FROM moz_app;--> statement-breakpoint

ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE loyalty_programs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY loyalty_programs_team_read ON loyalty_programs AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY loyalty_programs_owner_insert ON loyalty_programs AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner'
              AND created_by = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY loyalty_programs_admin_read ON loyalty_programs AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
