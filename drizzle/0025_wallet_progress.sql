-- P1-07 Wallet. (1) memberships gets the two loyalty counters the Wallet shows: gold in the current ingot and
-- ingots filled (P1-12 approvals write them with the ledger; DECISIONS 18 Nov "Wallet progress columns"). Both
-- default 0, so existing rows already satisfy the CHECKs; they are added NOT VALID (locking rule) and validated
-- in a later migration (FOLLOWUPS). (2) The memberships guard: a join (insert) by the web role must leave them
-- at 0. Updates are already covered: neither column is in customer_writable or staff_writable (0022), so no
-- web-role write can change them until P1-12's migration says otherwise. (3) A current member reads the
-- programme versions of their own shops (Wallet: ingot size; the Vault later). Left members don't (hidden).
-- contract: none needed (ADD COLUMN with a constant default, NOT VALID checks, function body, new policy);
-- brief locks on memberships and loyalty_programs, fail fast.
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "progress_gold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ingots_completed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_progress_gold_non_negative" CHECK ("memberships"."progress_gold" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ingots_completed_non_negative" CHECK ("memberships"."ingots_completed" >= 0) NOT VALID;--> statement-breakpoint

-- Same function as 0022, plus: a join may not set the loyalty counters.
CREATE OR REPLACE FUNCTION public.memberships_customer_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- What a customer may change on their own membership, plus the column the DB maintains itself.
  customer_writable CONSTANT text[] := ARRAY['muted', 'marketing_opt_in', 'left_at', 'updated_at'];
  -- What the shop's team may change on its members' memberships: the visit counters, plus updated_at.
  staff_writable CONSTANT text[] := ARRAY['purchase_count', 'last_visit_at', 'updated_at'];
  writable text[];
BEGIN
  -- Only the web role is limited; the worker (counters, expiry) and migrations are not.
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.purchase_count <> 0 OR NEW.last_visit_at IS NOT NULL
       OR NEW.progress_gold <> 0 OR NEW.ingots_completed <> 0
       OR NEW.joined_at <> now() OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'memberships: a join may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF OLD.user_id = public.app_user_id() THEN
      writable := customer_writable;
    ELSIF public.app_in_shop() AND OLD.shop_id = public.app_shop_id() THEN
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

-- The sub-select runs under memberships' own RLS (memberships_own), so it can only ever find the caller's rows.
CREATE POLICY loyalty_programs_member_read ON loyalty_programs AS PERMISSIVE FOR SELECT TO moz_app
  USING (EXISTS (SELECT 1 FROM memberships m
                 WHERE m.shop_id = loyalty_programs.shop_id
                   AND m.user_id = (SELECT app_user_id())
                   AND m.left_at IS NULL));
