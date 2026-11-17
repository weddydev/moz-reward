-- P1-A MEDIUM batch (P1-04 security review M1, 17 Nov): a customer rejoining a shop (their own membership's
-- left_at going from set to null) must pass the same shop-status wall as a first join (0020): suspended, closed
-- and pending shops take no members back. Leaving, muting and consent changes stay allowed in any shop status.
-- CREATE OR REPLACE keeps the function's owner, privileges and trigger; only the body changes.
-- contract: none needed (function body only, no destructive statement); brief lock on pg_proc, fail fast.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.memberships_customer_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- What a customer may change on their own membership, plus the column the DB maintains itself.
  customer_writable CONSTANT text[] := ARRAY['muted', 'marketing_opt_in', 'left_at', 'updated_at'];
BEGIN
  -- Only the web role is limited; the worker (counters, expiry) and migrations are not.
  IF current_user <> 'moz_app' THEN
    RETURN NEW;
  END IF;
  -- The shop's own team, in its own shop, on a membership of that shop (RLS limits the rest).
  IF public.app_in_shop() AND NEW.shop_id = public.app_shop_id()
     AND (TG_OP = 'INSERT' OR OLD.shop_id = public.app_shop_id()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.purchase_count <> 0 OR NEW.last_visit_at IS NOT NULL
       OR NEW.joined_at <> now() OR NEW.created_at <> now() OR NEW.updated_at <> now() THEN
      RAISE EXCEPTION 'memberships: a customer may not set server-owned columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF (to_jsonb(NEW) - customer_writable) IS DISTINCT FROM (to_jsonb(OLD) - customer_writable) THEN
    RAISE EXCEPTION 'memberships: a customer may change only muted, marketing_opt_in and left_at'
      USING ERRCODE = 'insufficient_privilege';
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
