-- P1-12 (f): the shop's Requests queue shows each open request's customer name and member ID (PRODUCT §5).
-- Staff can't read customer_profiles (only own and admin policies, 0009): the table also holds the phone
-- ciphertext and blind index, birthday and the 18+ flags, so a staff SELECT policy is not an option. Instead
-- this one function hands out exactly three columns (user_id, full_name, member_id) for people who are or were
-- members of the caller's scoped shop, and only while the caller is active staff of it (app_shop_role() reads
-- shop_staff live as moz_rls, so a deactivated member's stale session gets nothing). The shop comes from the
-- session scope, never a parameter. More than 100 ids is a bug in the caller: it raises, it is never cut short.
-- COMPLIANCE §2: the joined shop already receives "name, phone, member ID, visit history"; no new purpose.
-- Erased customers: erasure (P2-13) anonymises the profile and keeps the row; it must also make this function
-- return no card for them (CARRIED C-104 → P2-13).
-- Privileges: owned by moz_rls (the NOLOGIN owner of every SECURITY DEFINER helper, 0010), which gets
-- column-level SELECT on just these columns plus read policies for itself; EXECUTE for moz_app only. Because
-- every moz_rls-owned helper can read these three columns for every customer, an integration test pins moz_rls's
-- column grants on customer_profiles and its members (moz_owner only; never moz_app, moz_auth or moz_worker).
-- contract: none needed (new function, grants and policies; no table rewrite).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.shop_member_cards(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, full_name text, member_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF cardinality(p_user_ids) > 100 THEN
    RAISE EXCEPTION 'shop_member_cards: at most 100 ids per call' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT p.user_id, p.full_name, p.member_id
    FROM public.customer_profiles p
    WHERE public.app_scope() = 'shop'
      AND (SELECT public.app_shop_role()) IS NOT NULL
      AND p.user_id = ANY (p_user_ids)
      AND EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.user_id = p.user_id AND m.shop_id = (SELECT public.app_shop_id()));
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_member_cards(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shop_member_cards(uuid[]) TO moz_app;--> statement-breakpoint
GRANT SELECT (user_id, full_name, member_id) ON customer_profiles TO moz_rls;--> statement-breakpoint
GRANT SELECT (user_id, shop_id) ON memberships TO moz_rls;--> statement-breakpoint
CREATE POLICY customer_profiles_rls_cards ON customer_profiles AS PERMISSIVE FOR SELECT TO moz_rls
  USING (true);--> statement-breakpoint
CREATE POLICY memberships_rls_cards ON memberships AS PERMISSIVE FOR SELECT TO moz_rls USING (true);--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.shop_member_cards(uuid[]) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
