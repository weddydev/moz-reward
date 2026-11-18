-- P1-A close (security review SEC-M2, 18 Nov): `shops_own_update` (0009) lets a shop's whole team update its own
-- shop row, and nothing limited the columns, so any staff member could suspend or reopen the shop, change its
-- shop code or slug (breaking every printed QR and NFC tag), or swap its name and logo. A BEFORE UPDATE guard
-- now decides, for the web role in a shop scope on its own shop:
--   * the shop owner: the Settings fields (PRODUCT §14: profile, photos, category, location, Google Place ID,
--     VAT details) — owner_writable below;
--   * staff (and an inactive team member, whose role is NULL): nothing;
--   * id, slug, shop_code, status and created_at: no shop role; admins (owner/support, `shops_admin_write`)
--     change them in the admin scope, which this guard leaves to RLS.
-- The compare is generic (every column not listed is protected), so a new column is admin-only until it is
-- classified; tests/integration/shop-guard.test.ts fails when a column isn't. The worker and migrations (not
-- moz_app) are not limited.
-- contract: CREATE TRIGGER takes a brief lock on shops; fail fast.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.shops_team_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- What the shop owner may change on their shop, plus the column the DB maintains itself.
  owner_writable CONSTANT text[] := ARRAY['name', 'trading_name', 'category', 'description', 'address_line1',
    'address_line2', 'town', 'postcode', 'location', 'google_place_id', 'phone', 'logo_url', 'cover_url',
    'vat_number', 'updated_at'];
  writable text[];
BEGIN
  IF current_user <> 'moz_app' OR NOT public.app_in_shop() OR OLD.id IS DISTINCT FROM public.app_shop_id() THEN
    RETURN NEW;
  END IF;
  writable := CASE WHEN public.app_shop_role() = 'owner' THEN owner_writable ELSE ARRAY['updated_at'] END;
  IF (to_jsonb(NEW) - writable) IS DISTINCT FROM (to_jsonb(OLD) - writable) THEN
    RAISE EXCEPTION 'shops: % may not change these columns',
      CASE WHEN writable = owner_writable THEN 'the shop owner' ELSE 'shop staff' END
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shops_team_guard() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER shops_team_guard BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION public.shops_team_guard();
