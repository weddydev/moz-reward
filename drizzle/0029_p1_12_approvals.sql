-- P1-12 approvals, rejections, owner approval, reversals and receipts (PRODUCT §5, §6, §11; SECURITY §3, §12;
-- ENGINEERING §6–7; design check 26 Nov). New: ledger_entries (append-only), rewards, receipts,
-- shop_receipt_counters, fraud_flags; additive columns on memberships (the engine's MemberState: C-60, C-66) and
-- point_requests (the decision). Columns on existing tables are nullable or have constant defaults; their CHECKs
-- are NOT VALID (validated later). ingot_started_at is not backfilled: null means "since joined_at".
-- The walls (web role moz_app; the worker and migrations are not limited unless stated):
--  * self-award: no team member may decide a request, or write ledger, reward, receipt or membership-progress
--    rows, for their own membership (owners included);
--  * a staff member's approval needs award_gold <= their per-award limit (app_staff_award_limit, read live);
--    every award stays within the platform cap (award_cap(), content_settings 'award_cap', owner-only writes);
--  * awaiting_owner → approved/rejected only by an owner; nothing is decided 24 h after requested_at;
--  * earn/bonus rows only for a request this user approved in this transaction, summing to at most award_gold;
--    a reversal only by an owner or the receipt's own approver within 15 min, for exactly the receipt's gold;
--  * membership progress changes only in a transaction that wrote a ledger row for it (tx_id), never backwards
--    for ingots, tier or visits; rewards only beside an earn row; receipt numbers come from the counter, which
--    moves +1 only and must have its receipt by commit (deferred trigger) → gapless per shop;
--  * ledger_entries: UPDATE/DELETE/TRUNCATE refused for every role; rewards/receipts never deleted by app or
--    worker (a shop's hard delete, demo reset and tests only, cascades as the table owner).
-- contract: none needed (new types, tables and functions; additive nullable/defaulted columns; NOT VALID checks;
-- replaced guard function bodies keep every existing path: joins, leave, cancel, the worker's expiry).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "public"."membership_tier" AS ENUM('bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TYPE "public"."point_request_reject_reason" AS ENUM('no_purchase', 'not_recognised', 'already_awarded', 'wrong_shop', 'other');--> statement-breakpoint
CREATE TYPE "public"."point_request_source" AS ENUM('request', 'scan');--> statement-breakpoint
CREATE TYPE "public"."fraud_flag_status" AS ENUM('open', 'dismissed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('earn', 'bonus_streak', 'bonus_referral', 'bonus_game', 'redeem', 'reversal', 'expiry', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."reward_kind" AS ENUM('main', 'milestone', 'game', 'other');--> statement-breakpoint
CREATE TABLE "fraud_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "fraud_flag_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"type" "ledger_type" NOT NULL,
	"points" integer NOT NULL,
	"program_version" integer,
	"request_id" uuid,
	"receipt_id" uuid,
	"idempotency_key" text NOT NULL,
	"ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"tx_id" bigint DEFAULT txid_current() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_points_by_type" CHECK (CASE "ledger_entries"."type"
        WHEN 'earn' THEN "ledger_entries"."points" > 0
        WHEN 'bonus_streak' THEN "ledger_entries"."points" > 0
        WHEN 'bonus_referral' THEN "ledger_entries"."points" > 0
        WHEN 'bonus_game' THEN "ledger_entries"."points" > 0
        WHEN 'redeem' THEN "ledger_entries"."points" = 0
        WHEN 'reversal' THEN "ledger_entries"."points" < 0
        WHEN 'expiry' THEN "ledger_entries"."points" < 0
        ELSE "ledger_entries"."points" <> 0 END),
	CONSTRAINT "ledger_entries_points_bound" CHECK (abs("ledger_entries"."points") <= 100000),
	CONSTRAINT "ledger_entries_idempotency_key_length" CHECK (char_length("ledger_entries"."idempotency_key") BETWEEN 8 AND 100),
	CONSTRAINT "ledger_entries_ref_shape" CHECK (jsonb_typeof("ledger_entries"."ref") = 'object'
        AND "ledger_entries"."ref" - ARRAY['receiptId', 'requestId', 'rewardId', 'reason', 'multiplierPercent', 'base', 'version'] = '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"pdf_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_number_positive" CHECK ("receipts"."number" >= 1),
	CONSTRAINT "receipts_data_object" CHECK (jsonb_typeof("receipts"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" "reward_kind" NOT NULL,
	"label" text NOT NULL,
	"ingot_number" integer NOT NULL,
	"milestone_percent" smallint,
	"rewards_version" integer NOT NULL,
	"is_mystery" boolean DEFAULT false NOT NULL,
	"request_id" uuid,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "rewards_label_length" CHECK (char_length("rewards"."label") BETWEEN 1 AND 120),
	CONSTRAINT "rewards_ingot_number_positive" CHECK ("rewards"."ingot_number" >= 1),
	CONSTRAINT "rewards_milestone_has_percent" CHECK (("rewards"."kind" = 'milestone') = ("rewards"."milestone_percent" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_receipt_counters" (
	"shop_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "shop_receipt_counters_positive" CHECK ("shop_receipt_counters"."last_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ingot_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "milestones_reached" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "gold_shortfall" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "tier" "membership_tier" DEFAULT 'bronze' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "streak_weeks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "streak_last_week_start" date;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "amount_pence" integer;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "items" jsonb;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "award_gold" integer;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "reject_reason" "point_request_reject_reason";--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "reject_note" text;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "routed_by" uuid;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "routed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "point_requests" ADD COLUMN "source" "point_request_source" DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_receipt_counters" ADD CONSTRAINT "shop_receipt_counters_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fraud_flags_rule_entity_uq" ON "fraud_flags" USING btree ("rule","entity","entity_id");--> statement-breakpoint
CREATE INDEX "fraud_flags_status_created_idx" ON "fraud_flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_uq" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_reversal_uq" ON "ledger_entries" USING btree ("receipt_id") WHERE "ledger_entries"."type" = 'reversal';--> statement-breakpoint
CREATE INDEX "ledger_entries_membership_created_idx" ON "ledger_entries" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_membership_tx_idx" ON "ledger_entries" USING btree ("membership_id","tx_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_shop_created_idx" ON "ledger_entries" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_request_idx" ON "ledger_entries" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_receipt_idx" ON "ledger_entries" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_request_uq" ON "receipts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_shop_number_uq" ON "receipts" USING btree ("shop_id","number");--> statement-breakpoint
CREATE INDEX "receipts_membership_created_idx" ON "receipts" USING btree ("membership_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rewards_once_per_ingot_uq" ON "rewards" USING btree ("membership_id","ingot_number","kind",coalesce("milestone_percent", 0));--> statement-breakpoint
CREATE INDEX "rewards_membership_unlocked_idx" ON "rewards" USING btree ("membership_id","unlocked_at");--> statement-breakpoint
CREATE INDEX "rewards_shop_id_idx" ON "rewards" USING btree ("shop_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_gold_shortfall_non_negative" CHECK ("memberships"."gold_shortfall" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_streak_weeks_non_negative" CHECK ("memberships"."streak_weeks" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_amount_positive" CHECK ("point_requests"."amount_pence" IS NULL OR "point_requests"."amount_pence" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_award_gold_positive" CHECK ("point_requests"."award_gold" IS NULL OR "point_requests"."award_gold" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_items_shape" CHECK ("point_requests"."items" IS NULL OR (jsonb_typeof("point_requests"."items") = 'array' AND jsonb_array_length("point_requests"."items") <= 10)) NOT VALID;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_reject_note_length" CHECK ("point_requests"."reject_note" IS NULL OR char_length("point_requests"."reject_note") <= 200) NOT VALID;--> statement-breakpoint
ALTER TABLE "point_requests" ADD CONSTRAINT "point_requests_rejected_has_reason" CHECK (("point_requests"."status" = 'rejected') = ("point_requests"."reject_reason" IS NOT NULL)) NOT VALID;--> statement-breakpoint

-- ── Platform award cap (PRODUCT §5): content_settings 'award_cap' = {"pence": n, "gold": n}; a missing or invalid
-- value falls back to the default (£500, 500 gold), never "no cap". The service reads the same rule (award-cap.ts).
CREATE OR REPLACE FUNCTION public.award_cap(OUT pence integer, OUT gold integer)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT c.value INTO v FROM public.content_settings c WHERE c.key = 'award_cap';
  pence := 50000;
  gold := 500;
  IF v IS NOT NULL AND jsonb_typeof(v) = 'object'
     AND jsonb_typeof(v->'pence') = 'number' AND jsonb_typeof(v->'gold') = 'number'
     AND (v->>'pence') ~ '^[0-9]{1,8}$' AND (v->>'gold') ~ '^[0-9]{1,6}$'
     AND (v->>'pence')::integer BETWEEN 100 AND 10000000 AND (v->>'gold')::integer BETWEEN 1 AND 100000 THEN
    pence := (v->>'pence')::integer;
    gold := (v->>'gold')::integer;
  END IF;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.award_cap() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.award_cap() TO moz_app, moz_worker;--> statement-breakpoint
-- Only the admin owner writes the cap; moderators keep every other key (content_settings_admin stays). RESTRICTIVE,
-- per command (not FOR ALL, which would hide the key from the approval's read).
CREATE POLICY content_settings_award_cap_insert ON content_settings AS RESTRICTIVE FOR INSERT TO moz_app
  WITH CHECK (key <> 'award_cap' OR (SELECT app_admin_role()) = 'owner');--> statement-breakpoint
CREATE POLICY content_settings_award_cap_update ON content_settings AS RESTRICTIVE FOR UPDATE TO moz_app
  USING (key <> 'award_cap' OR (SELECT app_admin_role()) = 'owner')
  WITH CHECK (key <> 'award_cap' OR (SELECT app_admin_role()) = 'owner');--> statement-breakpoint
CREATE POLICY content_settings_award_cap_delete ON content_settings AS RESTRICTIVE FOR DELETE TO moz_app
  USING (key <> 'award_cap' OR (SELECT app_admin_role()) = 'owner');--> statement-breakpoint

-- ── The caller's live per-award limit in the scoped shop (NULL: none, or not a staff member). Definer like
-- app_shop_role (0010): reads shop_staff as moz_rls, so the policy can't be bypassed by a stale session.
CREATE OR REPLACE FUNCTION public.app_staff_award_limit() RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN (SELECT s.per_award_limit FROM public.shop_staff s
          WHERE public.app_scope() = 'shop' AND s.user_id = public.app_user_id()
            AND s.shop_id = public.app_shop_id() AND s.active);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_staff_award_limit() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_staff_award_limit() TO moz_app;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.app_staff_award_limit() OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;--> statement-breakpoint

-- ── point_requests: the team's decisions (replaces 0028's guard; insert and the member's cancel unchanged).
CREATE OR REPLACE FUNCTION public.point_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  decision_cols CONSTANT text[] := ARRAY['status', 'decided_at', 'decided_by', 'amount_pence', 'items',
    'award_gold', 'reject_reason', 'reject_note', 'routed_by', 'routed_at', 'updated_at'];
  role text;
  cap record;
  lim integer;
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.requested_at <> now() OR NEW.decided_at IS NOT NULL
       OR NEW.reminded_at IS NOT NULL OR NEW.created_at <> now() OR NEW.updated_at <> now()
       OR NEW.decided_by IS NOT NULL OR NEW.amount_pence IS NOT NULL OR NEW.items IS NOT NULL
       OR NEW.award_gold IS NOT NULL OR NEW.reject_reason IS NOT NULL OR NEW.reject_note IS NOT NULL
       OR NEW.routed_by IS NOT NULL OR NEW.routed_at IS NOT NULL OR NEW.source <> 'request' THEN
      RAISE EXCEPTION 'point_requests: a request may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  -- The member cancelling their own open request (leave, C-68).
  IF public.app_scope() = 'customer' THEN
    IF OLD.user_id = public.app_user_id()
       AND OLD.status IN ('pending', 'awaiting_owner') AND NEW.status = 'cancelled'
       AND NEW.decided_at = now()
       AND (to_jsonb(NEW) - ARRAY['status', 'decided_at', 'updated_at'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'decided_at', 'updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'point_requests: only the member may cancel their own open request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The shop's team deciding (P1-12).
  IF public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
     OR OLD.shop_id IS DISTINCT FROM public.app_shop_id() THEN
    RAISE EXCEPTION 'point_requests: not a request this scope may decide'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.user_id = public.app_user_id() THEN
    RAISE EXCEPTION 'point_requests: a team member may not decide their own request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status NOT IN ('pending', 'awaiting_owner') THEN
    RAISE EXCEPTION 'point_requests: this request is already decided'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.requested_at <= now() - interval '24 hours' THEN
    RAISE EXCEPTION 'point_requests: this request has expired'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - decision_cols) IS DISTINCT FROM (to_jsonb(OLD) - decision_cols) THEN
    RAISE EXCEPTION 'point_requests: a decision may change only %', array_to_string(decision_cols, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.items IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.items) e
       WHERE jsonb_typeof(e) <> 'string' OR char_length(e #>> '{}') NOT BETWEEN 1 AND 40) THEN
    RAISE EXCEPTION 'point_requests: items must be 1–40 character strings'
      USING ERRCODE = 'check_violation';
  END IF;
  role := public.app_shop_role();
  lim := public.app_staff_award_limit();
  SELECT * INTO cap FROM public.award_cap();
  IF NEW.award_gold > cap.gold OR NEW.amount_pence > cap.pence THEN
    RAISE EXCEPTION 'point_requests: above the platform award cap'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'awaiting_owner' THEN
    IF OLD.status = 'pending' AND role = 'staff' AND lim IS NOT NULL AND NEW.award_gold > lim
       AND NEW.routed_by = public.app_user_id() AND NEW.routed_at = now()
       AND NEW.decided_at IS NULL AND NEW.decided_by IS NULL
       AND NEW.reject_reason IS NULL AND NEW.reject_note IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status = 'approved' THEN
    IF NEW.decided_by = public.app_user_id() AND NEW.decided_at = now() AND NEW.award_gold IS NOT NULL
       AND NEW.reject_reason IS NULL AND NEW.reject_note IS NULL
       AND NEW.routed_by IS NOT DISTINCT FROM OLD.routed_by AND NEW.routed_at IS NOT DISTINCT FROM OLD.routed_at
       AND (role = 'owner'
            OR (role = 'staff' AND OLD.status = 'pending' AND (lim IS NULL OR NEW.award_gold <= lim))) THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.status = 'rejected' THEN
    IF NEW.decided_by = public.app_user_id() AND NEW.decided_at = now() AND NEW.reject_reason IS NOT NULL
       AND NEW.routed_by IS NOT DISTINCT FROM OLD.routed_by AND NEW.routed_at IS NOT DISTINCT FROM OLD.routed_at
       AND (role = 'owner' OR (role = 'staff' AND OLD.status = 'pending')) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'point_requests: this decision is not allowed (% → % as %)', OLD.status, NEW.status, role
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
GRANT UPDATE (decided_by, amount_pence, items, award_gold, reject_reason, reject_note, routed_by, routed_at)
  ON point_requests TO moz_app;--> statement-breakpoint
-- USING checks the shop only (a row lock needs it; status rules live in the guard, so a decided row is still
-- found and answered CONFLICT, design check HIGH-1).
CREATE POLICY point_requests_team_decide ON point_requests AS PERMISSIVE FOR UPDATE TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint

-- ── ledger_entries: append-only for every role (reject_mutation, 0003; db-foundation covers every such table).
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ledger_entries_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  req record;
  rcpt record;
  awarded integer;
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
  RAISE EXCEPTION 'ledger_entries: % rows are not written by the web role', NEW.type
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ledger_entries_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER ledger_entries_guard BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_guard();--> statement-breakpoint
REVOKE ALL ON ledger_entries FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ledger_entries FROM moz_app, moz_worker;--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ledger_entries_own_read ON ledger_entries AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer'
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = ledger_entries.membership_id
                       AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY ledger_entries_team_read ON ledger_entries AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY ledger_entries_team_insert ON ledger_entries AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop())
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = ledger_entries.membership_id
                            AND m.shop_id = ledger_entries.shop_id
                            AND m.user_id <> (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY ledger_entries_admin_read ON ledger_entries AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint

-- ── memberships: the team writes the loyalty state only beside its own ledger row (same transaction), never
-- for its own membership, never backwards for ingots, tier or visits (replaces 0025's guard).
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
      IF NOT EXISTS (SELECT 1 FROM public.ledger_entries l
                     WHERE l.membership_id = OLD.id AND l.tx_id = txid_current()
                       AND l.created_by = public.app_user_id()) THEN
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

-- ── rewards: unlocked only beside this user's earn row in this transaction; never updated or deleted here
-- (P1-16 adds the redeem path).
CREATE OR REPLACE FUNCTION public.rewards_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
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
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.rewards_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER rewards_guard BEFORE INSERT ON rewards
  FOR EACH ROW EXECUTE FUNCTION rewards_guard();--> statement-breakpoint
REVOKE ALL ON rewards FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON rewards FROM moz_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON rewards FROM moz_worker;--> statement-breakpoint
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE rewards FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY rewards_own_read ON rewards AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer'
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = rewards.membership_id
                       AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY rewards_team_read ON rewards AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY rewards_team_insert ON rewards AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop())
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = rewards.membership_id
                            AND m.shop_id = rewards.shop_id
                            AND m.user_id <> (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY rewards_admin_read ON rewards AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint

-- ── shop_receipt_counters: +1 steps only, and the number's receipt must exist by commit (gapless per shop).
CREATE OR REPLACE FUNCTION public.shop_receipt_counters_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.last_number <> 1)
     OR (TG_OP = 'UPDATE' AND (NEW.shop_id <> OLD.shop_id OR NEW.last_number <> OLD.last_number + 1)) THEN
    RAISE EXCEPTION 'shop_receipt_counters: the counter only moves on by one'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_receipt_counters_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER shop_receipt_counters_guard BEFORE INSERT OR UPDATE ON shop_receipt_counters
  FOR EACH ROW EXECUTE FUNCTION shop_receipt_counters_guard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.shop_receipt_counters_has_receipt() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.shop_id = NEW.shop_id AND r.number = NEW.last_number) THEN
    RAISE EXCEPTION 'shop_receipt_counters: receipt % of this shop was never written', NEW.last_number
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_receipt_counters_has_receipt() FROM PUBLIC;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER shop_receipt_counters_has_receipt AFTER INSERT OR UPDATE ON shop_receipt_counters
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION shop_receipt_counters_has_receipt();--> statement-breakpoint
REVOKE ALL ON shop_receipt_counters FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON shop_receipt_counters FROM moz_app;--> statement-breakpoint
GRANT UPDATE (last_number) ON shop_receipt_counters TO moz_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON shop_receipt_counters FROM moz_worker;--> statement-breakpoint
ALTER TABLE shop_receipt_counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_receipt_counters FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY shop_receipt_counters_team ON shop_receipt_counters AS PERMISSIVE FOR ALL TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint

-- ── receipts: written once by the approval (number = the counter's), the PDF key set by the worker only.
CREATE OR REPLACE FUNCTION public.receipts_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF public.app_scope() IS DISTINCT FROM 'shop' OR NOT public.app_in_shop()
     OR NEW.shop_id IS DISTINCT FROM public.app_shop_id()
     OR NEW.created_by IS DISTINCT FROM public.app_user_id() OR NEW.created_at <> now() OR NEW.pdf_key IS NOT NULL
     OR NEW.number IS DISTINCT FROM (SELECT c.last_number FROM public.shop_receipt_counters c
                                     WHERE c.shop_id = NEW.shop_id)
     OR NOT EXISTS (SELECT 1 FROM public.point_requests r
                    WHERE r.id = NEW.request_id AND r.membership_id = NEW.membership_id
                      AND r.shop_id = NEW.shop_id AND r.status = 'approved'
                      AND r.decided_by = public.app_user_id() AND r.decided_at = now()
                      AND r.user_id <> public.app_user_id()) THEN
    RAISE EXCEPTION 'receipts: written only by the approval, numbered by the shop''s counter'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.receipts_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER receipts_guard BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION receipts_guard();--> statement-breakpoint
REVOKE ALL ON receipts FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON receipts FROM moz_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON receipts FROM moz_worker;--> statement-breakpoint
GRANT UPDATE (pdf_key) ON receipts TO moz_worker;--> statement-breakpoint
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY receipts_own_read ON receipts AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer'
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = receipts.membership_id
                       AND m.user_id = (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY receipts_team_read ON receipts AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY receipts_team_insert ON receipts AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop())
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = receipts.membership_id
                            AND m.shop_id = receipts.shop_id
                            AND m.user_id <> (SELECT app_user_id())));--> statement-breakpoint
CREATE POLICY receipts_admin_read ON receipts AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint

-- ── fraud_flags: written by the worker's rule jobs, read by admins (P4-08 adds the monitor and dismissals).
REVOKE ALL ON fraud_flags FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON fraud_flags FROM moz_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON fraud_flags FROM moz_worker;--> statement-breakpoint
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fraud_flags FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY fraud_flags_admin_read ON fraud_flags AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));
