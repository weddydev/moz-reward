-- P0-20 security re-review of 0010 (DECISIONS P0-20 re-review): admin writes bound to the admin role (PRODUCT §2),
-- definer helpers not callable by PUBLIC, outbox rows of shop/admin scopes must carry a role. No data changes.
-- contract: replaces policies with narrower ones; no app path writes these tables as another admin role.
SET lock_timeout = '5s';--> statement-breakpoint

-- HIGH-1: a shop team or a shop is changed only by the admin owner or support (PRODUCT §2: Support handles
-- shops); moderator and finance read only. FOR ALL keeps their SELECT through the *_admin_read policies.
DROP POLICY shop_staff_admin ON shop_staff;--> statement-breakpoint
CREATE POLICY shop_staff_admin_read ON shop_staff AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY shop_staff_admin_write ON shop_staff AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'support'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'support'));--> statement-breakpoint
DROP POLICY shops_admin ON shops;--> statement-breakpoint
CREATE POLICY shops_admin_read ON shops AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY shops_admin_write ON shops AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'support'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'support'));--> statement-breakpoint

-- 2: kill switches belong to the admin owner; content settings to the owner and moderators (PRODUCT §2).
-- Reads stay with feature_flags_read / content_settings_read (USING true).
DROP POLICY feature_flags_admin ON feature_flags;--> statement-breakpoint
CREATE POLICY feature_flags_admin ON feature_flags AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) = 'owner')
  WITH CHECK ((SELECT app_admin_role()) = 'owner');--> statement-breakpoint
DROP POLICY content_settings_admin ON content_settings;--> statement-breakpoint
CREATE POLICY content_settings_admin ON content_settings AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) IN ('owner', 'moderator'))
  WITH CHECK ((SELECT app_admin_role()) IN ('owner', 'moderator'));--> statement-breakpoint

-- 4: the role helpers are an oracle of who is staff/admin where: only the roles whose policies call them.
REVOKE ALL ON FUNCTION public.app_in_shop() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_is_admin() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_shop_role() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.app_admin_role() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.app_in_shop(), public.app_is_admin(), public.app_shop_role(),
  public.app_admin_role() TO moz_app, moz_auth;--> statement-breakpoint

-- 7: a shop/admin outbox row always names the writer's real role (NULL when the writer isn't on the team).
DROP POLICY outbox_append ON outbox;--> statement-breakpoint
CREATE POLICY outbox_append ON outbox AS PERMISSIVE FOR INSERT TO moz_app WITH CHECK (
  scope_kind = (SELECT app_scope()) AND scope_kind IN ('customer', 'shop', 'admin')
  AND scope_user_id = (SELECT app_user_id())
  AND scope_shop_id IS NOT DISTINCT FROM (SELECT app_shop_id())
  AND (scope_kind = 'customer' OR scope_role IS NOT NULL)
  AND scope_role IS NOT DISTINCT FROM (CASE scope_kind WHEN 'shop' THEN (SELECT app_shop_role())
    WHEN 'admin' THEN (SELECT app_admin_role()) END));--> statement-breakpoint

-- 9: the revocation trigger only reads and deletes sessions.
DROP POLICY sessions_rls_revoke ON sessions;--> statement-breakpoint
CREATE POLICY sessions_rls_read ON sessions AS PERMISSIVE FOR SELECT TO moz_rls USING (true);--> statement-breakpoint
CREATE POLICY sessions_rls_revoke ON sessions AS PERMISSIVE FOR DELETE TO moz_rls USING (true);
