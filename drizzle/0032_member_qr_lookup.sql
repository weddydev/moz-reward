-- P1-14: the staff member-QR verify (security design check 26 Nov, M5). A scanned token gives a member ID; staff
-- may learn whose card it is only when that customer is a CURRENT member of the caller's scoped shop (left_at IS
-- NULL) and only while the caller is active staff of it. Same walls as shop_member_cards (0030): the shop comes
-- from the session scope, never a parameter; exactly three columns; owned by moz_rls (NOLOGIN owner of every
-- SECURITY DEFINER helper), EXECUTE for moz_app only. moz_rls gains one column grant, memberships.left_at (not
-- personal data); member-cards.test.ts pins moz_rls's grants on customer_profiles, and member-qr.test.ts pins
-- its memberships grants.
-- Erased customers (P2-13) must get no card here either (CARRIED C-104 covers both functions).
-- contract: none needed (new function and a column grant; no table rewrite).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.shop_member_by_member_id(p_member_id text)
RETURNS TABLE (user_id uuid, full_name text, member_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN QUERY
    SELECT p.user_id, p.full_name, p.member_id
    FROM public.customer_profiles p
    WHERE public.app_scope() = 'shop'
      AND (SELECT public.app_shop_role()) IS NOT NULL
      AND p.member_id = p_member_id
      AND EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.user_id = p.user_id
                    AND m.shop_id = (SELECT public.app_shop_id())
                    AND m.left_at IS NULL);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_member_by_member_id(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shop_member_by_member_id(text) TO moz_app;--> statement-breakpoint
GRANT SELECT (left_at) ON memberships TO moz_rls;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.shop_member_by_member_id(text) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
