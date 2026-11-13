-- P1-01 (C-34, P0-20 review). Two parts:
-- 1. scripts/check-migrations.ts now fails a policy that gives moz_app every row (USING / WITH CHECK true) unless
--    the same migration states why. The two such policies (0010) are dropped and re-created here unchanged, with
--    their reasons, inside this migration's transaction (no moment without a read policy).
-- 2. Customers can't write membership counters. memberships_own is FOR ALL to moz_app and staff use the same
--    role, so column grants can't tell them apart; a BEFORE trigger does. For moz_app outside the shop's own
--    staff scope, an UPDATE may change only muted, marketing_opt_in and left_at (updated_at is the DB's), and an
--    INSERT must leave the server-owned columns at their defaults. The UPDATE compare is generic (every column
--    not listed is protected), so a new column is protected by default; tests/integration/membership-guard.test.ts
--    fails when a column isn't classified.
-- contract: CREATE POLICY / CREATE TRIGGER take brief locks on two config tables and memberships; fail fast.
SET lock_timeout = '5s';--> statement-breakpoint

-- rls: open feature_flags — global on/off switches with no tenant data; every request reads them (writes stay admin-only)
DROP POLICY feature_flags_read ON feature_flags;--> statement-breakpoint
CREATE POLICY feature_flags_read ON feature_flags AS PERMISSIVE FOR SELECT TO moz_app, moz_auth USING (true);--> statement-breakpoint
-- rls: open content_settings — global site copy and settings with no tenant data; public pages read them (writes stay admin-only)
DROP POLICY content_settings_read ON content_settings;--> statement-breakpoint
CREATE POLICY content_settings_read ON content_settings AS PERMISSIVE FOR SELECT TO moz_app, moz_auth USING (true);--> statement-breakpoint

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
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - customer_writable) IS DISTINCT FROM (to_jsonb(OLD) - customer_writable) THEN
    RAISE EXCEPTION 'memberships: a customer may change only muted, marketing_opt_in and left_at'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.memberships_customer_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER memberships_customer_guard BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION public.memberships_customer_guard();
