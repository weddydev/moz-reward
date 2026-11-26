-- P1-16 (PRODUCT §6 "Redemption", §15; SECURITY §6; ARCHITECTURE §4–5; design check 27 Nov): rewards and
-- redemption. New: redemption_codes (the code is never stored, only an HMAC of shop + code); reward validity
-- (loyalty_programs.reward_valid_days, rewards.expires_at set here by trigger from the reward's programme version,
-- immutable); shops.closed_at (stamped when a shop becomes closed: rewards redeem for 30 days after).
-- The walls (web role moz_app):
--  * a customer creates a live code only for their own current membership's unredeemed, unexpired reward, in that
--    reward's and membership's shop, while the shop redeems (shop_redeemable); one live code per member;
--  * a customer only voids their own live code (regenerated, left);
--  * the team confirms a live code of its own shop only, never for its own membership, only before the code's and
--    the reward's expiry (clock_timestamp, after the row lock), stamped with the confirming transaction;
--  * rewards.redeemed_at changes once (null → now()) beside that confirm; nothing else on rewards ever changes;
--  * a `redeem` ledger row: 0 gold, beside that confirm, for exactly that reward; and a redeem row is never a
--    reason for the team to change a membership's progress (memberships guard).
-- Existing rewards get expires_at from their version (all 90 days today). Checks on existing tables are NOT VALID;
-- the rewards index is built CONCURRENTLY (drizzle/concurrent/0034_rewards_ready.sql).
-- contract: none needed (new table, types and functions; additive columns with constant or stable defaults;
-- NOT VALID checks; the replaced guards keep every existing path and add the redeem ones; the ref-shape check is
-- dropped and re-added wider in the same transaction).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('live', 'voided', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."redemption_void_reason" AS ENUM('regenerated', 'left', 'erased');--> statement-breakpoint
CREATE TABLE "redemption_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"status" "redemption_status" DEFAULT 'live' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" "redemption_void_reason",
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"confirm_tx_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemption_codes_hash_shape" CHECK ("redemption_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "redemption_codes_window" CHECK ("redemption_codes"."expires_at" = "redemption_codes"."created_at" + interval '15 minutes'),
	CONSTRAINT "redemption_codes_status_shape" CHECK (CASE "redemption_codes"."status"
        WHEN 'live' THEN "redemption_codes"."voided_at" IS NULL AND "redemption_codes"."void_reason" IS NULL AND "redemption_codes"."confirmed_at" IS NULL AND "redemption_codes"."confirmed_by" IS NULL AND "redemption_codes"."confirm_tx_id" IS NULL
        WHEN 'voided' THEN "redemption_codes"."voided_at" IS NOT NULL AND "redemption_codes"."void_reason" IS NOT NULL AND "redemption_codes"."confirmed_at" IS NULL AND "redemption_codes"."confirmed_by" IS NULL AND "redemption_codes"."confirm_tx_id" IS NULL
        ELSE "redemption_codes"."voided_at" IS NULL AND "redemption_codes"."void_reason" IS NULL AND "redemption_codes"."confirmed_at" IS NOT NULL AND "redemption_codes"."confirmed_by" IS NOT NULL AND "redemption_codes"."confirm_tx_id" IS NOT NULL END)
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_ref_shape";--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "reward_valid_days" smallint DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD CONSTRAINT "redemption_codes_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "redemption_codes_live_code_uq" ON "redemption_codes" USING btree ("shop_id","code_hash") WHERE "redemption_codes"."status" = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX "redemption_codes_live_member_uq" ON "redemption_codes" USING btree ("membership_id") WHERE "redemption_codes"."status" = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX "redemption_codes_confirmed_reward_uq" ON "redemption_codes" USING btree ("reward_id") WHERE "redemption_codes"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "redemption_codes_lookup_idx" ON "redemption_codes" USING btree ("shop_id","code_hash","created_at");--> statement-breakpoint
CREATE INDEX "redemption_codes_shop_live_idx" ON "redemption_codes" USING btree ("shop_id","expires_at") WHERE "redemption_codes"."status" = 'live';--> statement-breakpoint
CREATE INDEX "redemption_codes_reward_idx" ON "redemption_codes" USING btree ("reward_id");--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_reward_valid_days_range" CHECK ("loyalty_programs"."reward_valid_days" BETWEEN 90 AND 365) NOT VALID;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ref_shape" CHECK (jsonb_typeof("ledger_entries"."ref") = 'object'
        AND "ledger_entries"."ref" - ARRAY['receiptId', 'requestId', 'rewardId', 'redemptionId', 'reason', 'multiplierPercent', 'base', 'version'] = '{}'::jsonb) NOT VALID;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_redeemed_after_unlock" CHECK ("rewards"."redeemed_at" IS NULL OR "rewards"."redeemed_at" >= "rewards"."unlocked_at") NOT VALID;--> statement-breakpoint

-- ── Time and state helpers.
-- The end of the London day `p_days` days after `p_at`'s London date (src/lib/loyalty/redeem.ts rewardExpiresAt).
CREATE OR REPLACE FUNCTION public.reward_expires_at(p_at timestamptz, p_days integer) RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT ((((p_at AT TIME ZONE 'Europe/London')::date + p_days + 1)::timestamp) AT TIME ZONE 'Europe/London')
$$;--> statement-breakpoint
-- PRODUCT §15: active, expiring, grace, restricted redeem; closed for 30 days after closing; pending, suspended not.
CREATE OR REPLACE FUNCTION public.shop_redeemable(p_shop uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = p_shop
                   AND (s.status IN ('active', 'expiring', 'grace', 'restricted')
                        OR (s.status = 'closed' AND s.closed_at > now() - interval '30 days')))
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_redeemable(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shop_redeemable(uuid) TO moz_app, moz_worker;--> statement-breakpoint

-- ── shops.closed_at: stamped when the status becomes closed, cleared when it leaves closed; the web role never
-- sets it by hand (the worker, migrations and tests may correct it while the status stays the same).
CREATE OR REPLACE FUNCTION public.shops_closed_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'closed' THEN
    NEW.closed_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.status <> 'closed' THEN
    NEW.closed_at := now();
  ELSE
    NEW.closed_at := OLD.closed_at;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shops_closed_at() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER shops_closed_at BEFORE INSERT OR UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION shops_closed_at();--> statement-breakpoint
UPDATE "shops" SET "closed_at" = "updated_at" WHERE "status" = 'closed';--> statement-breakpoint

-- ── rewards: expires_at from the reward's programme version, at unlock, for every role; existing rows backfilled.
UPDATE "rewards" r SET "expires_at" = public.reward_expires_at(r.unlocked_at, coalesce(
  (SELECT p.reward_valid_days FROM loyalty_programs p WHERE p.shop_id = r.shop_id AND p.version = r.rewards_version),
  90));--> statement-breakpoint

-- ── ledger_entries guard (replaces 0029's): every path as before, plus the redeem row.
CREATE OR REPLACE FUNCTION public.ledger_entries_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  req record;
  rcpt record;
  awarded integer;
  code record;
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
     OR NEW.shop_id IS DISTINCT FROM public.app_shop_id()
     OR NEW.created_by IS DISTINCT FROM public.app_user_id()
     OR NEW.created_at <> now() OR NEW.tx_id <> txid_current() THEN
    RAISE EXCEPTION 'ledger_entries: only the shop''s team writes its ledger, stamped by the database'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.membership_id
                   AND m.shop_id = NEW.shop_id AND m.user_id <> public.app_user_id()) THEN
    RAISE EXCEPTION 'ledger_entries: not a member of this shop (or the writer''s own membership)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.type IN ('earn', 'bonus_streak') THEN
    SELECT r.id, r.award_gold INTO req FROM public.point_requests r
     WHERE r.id = NEW.request_id AND r.membership_id = NEW.membership_id AND r.status = 'approved'
       AND r.decided_by = public.app_user_id() AND r.decided_at = now();
    IF req.id IS NULL OR NEW.idempotency_key <> req.id::text || ':' || NEW.type::text THEN
      RAISE EXCEPTION 'ledger_entries: gold only for a request this user approved in this transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT coalesce(sum(l.points), 0) INTO awarded FROM public.ledger_entries l
     WHERE l.request_id = req.id AND l.type IN ('earn', 'bonus_streak');
    IF awarded + NEW.points > req.award_gold THEN
      RAISE EXCEPTION 'ledger_entries: more gold than the approved award'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.type = 'reversal' THEN
    SELECT c.id, c.request_id, c.created_by, c.created_at INTO rcpt FROM public.receipts c
     WHERE c.id = NEW.receipt_id AND c.membership_id = NEW.membership_id AND c.shop_id = NEW.shop_id;
    IF rcpt.id IS NULL OR NEW.idempotency_key <> rcpt.id::text || ':reversal'
       OR NOT (public.app_shop_role() = 'owner'
               OR (rcpt.created_by = public.app_user_id() AND rcpt.created_at > now() - interval '15 minutes')) THEN
      RAISE EXCEPTION 'ledger_entries: a reversal needs the owner, or the award''s own approver within 15 minutes'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT coalesce(sum(l.points), 0) INTO awarded FROM public.ledger_entries l
     WHERE l.request_id = rcpt.request_id AND l.type IN ('earn', 'bonus_streak');
    IF NEW.points <> -awarded THEN
      RAISE EXCEPTION 'ledger_entries: a reversal takes back exactly the receipt''s gold'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.type = 'redeem' THEN
    -- P1-16: 0 gold, beside the code this user confirmed in this transaction, for exactly that reward.
    SELECT c.id, c.reward_id INTO code FROM public.redemption_codes c
     WHERE c.id::text = NEW.ref->>'redemptionId' AND c.shop_id = NEW.shop_id
       AND c.membership_id = NEW.membership_id AND c.status = 'confirmed'
       AND c.confirmed_by = public.app_user_id() AND c.confirm_tx_id = txid_current();
    IF code.id IS NULL OR NEW.points <> 0 OR NEW.request_id IS NOT NULL OR NEW.receipt_id IS NOT NULL
       OR NEW.ref->>'rewardId' IS DISTINCT FROM code.reward_id::text
       OR NEW.idempotency_key <> code.id::text || ':redeem' THEN
      RAISE EXCEPTION 'ledger_entries: a redeem row only beside the code this user confirmed in this transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries: % rows are not written by the web role', NEW.type
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint

-- ── memberships guard (replaces 0029's): as before, but a redeem row never lets the team change progress.
CREATE OR REPLACE FUNCTION public.memberships_customer_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  customer_writable CONSTANT text[] := ARRAY['muted', 'marketing_opt_in', 'left_at', 'updated_at'];
  staff_writable CONSTANT text[] := ARRAY['purchase_count', 'last_visit_at', 'progress_gold', 'ingots_completed',
    'ingot_started_at', 'milestones_reached', 'gold_shortfall', 'tier', 'streak_weeks', 'streak_last_week_start',
    'updated_at'];
  writable text[];
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.purchase_count <> 0 OR NEW.last_visit_at IS NOT NULL
       OR NEW.progress_gold <> 0 OR NEW.ingots_completed <> 0
       OR NEW.ingot_started_at IS NOT NULL OR NEW.milestones_reached <> '{}'::smallint[]
       OR NEW.gold_shortfall <> 0 OR NEW.tier <> 'bronze' OR NEW.streak_weeks <> 0
       OR NEW.streak_last_week_start IS NOT NULL
       OR NEW.joined_at <> now() OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'memberships: a join may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- Their own membership is the member's whatever the scope (a team member mutes or leaves it like anyone);
    -- customer_writable holds no loyalty column, so it is never a path to self-award.
    IF OLD.user_id = public.app_user_id() THEN
      writable := customer_writable;
    ELSIF public.app_scope() = 'shop' AND public.app_in_shop() AND OLD.shop_id = public.app_shop_id()
          AND OLD.user_id <> public.app_user_id() THEN
      writable := staff_writable;
    ELSE
      RAISE EXCEPTION 'memberships: not a membership this scope may change'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (to_jsonb(NEW) - writable) IS DISTINCT FROM (to_jsonb(OLD) - writable) THEN
      RAISE EXCEPTION 'memberships: % may change only %', CASE WHEN writable = customer_writable
        THEN 'a member' ELSE 'the shop''s team' END, array_to_string(writable, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF writable = staff_writable
       AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      IF NEW.ingots_completed < OLD.ingots_completed OR NEW.purchase_count < OLD.purchase_count
         OR array_position(enum_range(NULL::membership_tier), NEW.tier)
            < array_position(enum_range(NULL::membership_tier), OLD.tier) THEN
        RAISE EXCEPTION 'memberships: ingots, tier and visits never go down'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- A 0-gold redeem row (P1-16) is not a reason to change progress (0034).
      IF NOT EXISTS (SELECT 1 FROM public.ledger_entries l
                     WHERE l.membership_id = OLD.id AND l.tx_id = txid_current()
                       AND l.created_by = public.app_user_id() AND l.type <> 'redeem') THEN
        RAISE EXCEPTION 'memberships: loyalty state changes only with a ledger entry in the same transaction'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  -- A join (insert) or a rejoin (left_at set → null): suspended, closed and pending shops take no members
  -- (restricted plans still do, PRODUCT §15).
  IF (TG_OP = 'INSERT' OR (OLD.left_at IS NOT NULL AND NEW.left_at IS NULL))
     AND NOT EXISTS (SELECT 1 FROM public.shops s WHERE s.id = NEW.shop_id
                     AND s.status IN ('active', 'expiring', 'grace', 'restricted')) THEN
    RAISE EXCEPTION 'memberships: this shop is not taking new members'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- ── rewards guard (replaces 0029's). INSERT: expires_at always from the version (every role); the web role's
-- unlock rules as before. UPDATE (web role): redeemed_at null → now() only, beside this user's confirm of a code
-- for this reward in this transaction; every other column fixed. The worker never updates rewards.
CREATE OR REPLACE FUNCTION public.rewards_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expires_at := public.reward_expires_at(NEW.unlocked_at, coalesce(
      (SELECT p.reward_valid_days FROM public.loyalty_programs p
        WHERE p.shop_id = NEW.shop_id AND p.version = NEW.rewards_version), 90));
    IF current_user <> 'moz_app' THEN
      RETURN NEW;
    END IF;
    IF public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
       OR NEW.shop_id IS DISTINCT FROM public.app_shop_id()
       OR NEW.kind NOT IN ('main', 'milestone') OR NEW.unlocked_at <> now() OR NEW.redeemed_at IS NOT NULL
       OR NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.membership_id
                        AND m.shop_id = NEW.shop_id AND m.user_id <> public.app_user_id())
       OR NOT EXISTS (SELECT 1 FROM public.ledger_entries l
                      WHERE l.membership_id = NEW.membership_id AND l.tx_id = txid_current()
                        AND l.type = 'earn' AND l.created_by = public.app_user_id()
                        AND l.request_id = NEW.request_id) THEN
      RAISE EXCEPTION 'rewards: unlocked only by an approval in this transaction'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'redeemed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'redeemed_at')
     OR OLD.redeemed_at IS NOT NULL OR NEW.redeemed_at IS DISTINCT FROM now()
     OR public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
     OR OLD.shop_id IS DISTINCT FROM public.app_shop_id()
     OR NOT EXISTS (SELECT 1 FROM public.redemption_codes c
                    WHERE c.reward_id = OLD.id AND c.shop_id = OLD.shop_id AND c.status = 'confirmed'
                      AND c.confirmed_by = public.app_user_id() AND c.confirm_tx_id = txid_current()) THEN
    RAISE EXCEPTION 'rewards: redeemed only by the team''s confirm of its code, once'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER rewards_guard ON rewards;--> statement-breakpoint
CREATE TRIGGER rewards_guard BEFORE INSERT OR UPDATE ON rewards
  FOR EACH ROW EXECUTE FUNCTION rewards_guard();--> statement-breakpoint
REVOKE UPDATE ON rewards FROM moz_worker;--> statement-breakpoint
GRANT UPDATE (redeemed_at) ON rewards TO moz_app;--> statement-breakpoint
-- USING checks the shop only (a row lock needs it; the rules live in the guard, 0029 design check HIGH-1).
CREATE POLICY rewards_team_redeem ON rewards AS PERMISSIVE FOR UPDATE TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint

-- ── redemption_codes guard (web role). Messages never carry a code or its hash.
CREATE OR REPLACE FUNCTION public.redemption_codes_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  void_cols CONSTANT text[] := ARRAY['status', 'voided_at', 'void_reason'];
  confirm_cols CONSTANT text[] := ARRAY['status', 'confirmed_by', 'confirmed_at', 'confirm_tx_id'];
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF public.app_scope() IS DISTINCT FROM 'customer'
       OR NEW.status <> 'live' OR NEW.created_at <> now() OR NEW.expires_at <> now() + interval '15 minutes'
       OR NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = NEW.membership_id
                        AND m.user_id = public.app_user_id() AND m.shop_id = NEW.shop_id AND m.left_at IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.rewards r WHERE r.id = NEW.reward_id
                        AND r.membership_id = NEW.membership_id AND r.shop_id = NEW.shop_id
                        AND r.redeemed_at IS NULL AND r.expires_at > now())
       OR NOT public.shop_redeemable(NEW.shop_id) THEN
      RAISE EXCEPTION 'redemption_codes: a code only for your own ready reward at a shop that redeems'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'live' AND NEW.status = 'voided' AND public.app_scope() = 'customer'
     AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = OLD.membership_id
                   AND m.user_id = public.app_user_id()) THEN
    IF (to_jsonb(NEW) - void_cols) IS DISTINCT FROM (to_jsonb(OLD) - void_cols)
       OR NEW.voided_at IS DISTINCT FROM now() OR NEW.void_reason NOT IN ('regenerated', 'left') THEN
      RAISE EXCEPTION 'redemption_codes: a member only voids their own live code'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'live' AND NEW.status = 'confirmed' AND public.app_scope() = 'shop' AND public.app_in_shop()
     AND OLD.shop_id = public.app_shop_id() THEN
    NEW.confirm_tx_id := txid_current();
    IF (to_jsonb(NEW) - confirm_cols) IS DISTINCT FROM (to_jsonb(OLD) - confirm_cols)
       OR NEW.confirmed_by IS DISTINCT FROM public.app_user_id() OR NEW.confirmed_at IS DISTINCT FROM now()
       OR clock_timestamp() >= OLD.expires_at
       OR NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = OLD.membership_id
                        AND m.shop_id = OLD.shop_id AND m.left_at IS NULL AND m.user_id <> public.app_user_id())
       OR NOT EXISTS (SELECT 1 FROM public.rewards r WHERE r.id = OLD.reward_id AND r.shop_id = OLD.shop_id
                        AND r.redeemed_at IS NULL AND r.expires_at > clock_timestamp())
       OR NOT public.shop_redeemable(OLD.shop_id) THEN
      RAISE EXCEPTION 'redemption_codes: the team confirms a live, unexpired code of its own shop, not its own'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'redemption_codes: this change is not allowed'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.redemption_codes_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER redemption_codes_guard BEFORE INSERT OR UPDATE ON redemption_codes
  FOR EACH ROW EXECUTE FUNCTION redemption_codes_guard();--> statement-breakpoint
REVOKE ALL ON redemption_codes FROM PUBLIC, moz_auth, moz_app, moz_worker;--> statement-breakpoint
GRANT SELECT ON redemption_codes TO moz_app, moz_worker;--> statement-breakpoint
-- Table-level INSERT (Drizzle names every column, with DEFAULT): the guard pins status and created_at, and the
-- status CHECK keeps the void/confirm columns empty on a live row.
GRANT INSERT ON redemption_codes TO moz_app;--> statement-breakpoint
GRANT UPDATE (status, voided_at, void_reason, confirmed_by, confirmed_at, confirm_tx_id)
  ON redemption_codes TO moz_app;--> statement-breakpoint
ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE redemption_codes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY redemption_codes_own_read ON redemption_codes AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer'
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = redemption_codes.membership_id
                       AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY redemption_codes_own_insert ON redemption_codes AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK ((SELECT app_scope()) = 'customer'
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = redemption_codes.membership_id
                            AND m.shop_id = redemption_codes.shop_id
                            AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY redemption_codes_own_void ON redemption_codes AS PERMISSIVE FOR UPDATE TO moz_app
  USING ((SELECT app_scope()) = 'customer'
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = redemption_codes.membership_id
                       AND m.user_id = (SELECT app_user_id())))
  WITH CHECK ((SELECT app_scope()) = 'customer'
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = redemption_codes.membership_id
                            AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY redemption_codes_team_read ON redemption_codes AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY redemption_codes_team_confirm ON redemption_codes AS PERMISSIVE FOR UPDATE TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY redemption_codes_admin_read ON redemption_codes AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
