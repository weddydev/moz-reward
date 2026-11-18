-- P1-A close (security review SEC-M1, 18 Nov): the shop's team had a blanket pass in the memberships guard, so
-- in its own shop a staff role could move a membership to another user, rewrite joined_at / created_at, opt a
-- customer into marketing, mute or "leave" them, raise the counters on its own membership, and join its own
-- shop with made-up counters. Now every web-role write is checked against an explicit list:
--   * your own membership (any scope): the customer columns only, never the counters (no self-award);
--   * another member of the shop you are working in (staff/owner scope): the visit counters only (P1-07
--     approvals); a counter column added later is protected until its migration adds it to staff_writable;
--   * a join (insert), the shop's team included: server-owned columns at their defaults, shop taking members.
-- id, user_id, shop_id, joined_at and created_at are in no list, so they are immutable for every web-role write.
-- The worker and migrations (not moz_app) stay unrestricted. CREATE OR REPLACE keeps the owner, the REVOKE and
-- the trigger; only the body changes.
-- contract: none needed (function body only, no destructive statement); brief lock on pg_proc, fail fast.
SET lock_timeout = '5s';--> statement-breakpoint
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
$$;
