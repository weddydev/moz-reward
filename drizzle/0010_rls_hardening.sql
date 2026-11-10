-- P0-20 security review (DECISIONS P0-20): hardening of 0009. No data changes; privileges and policies only.
-- contract: replaces policies and narrows grants; every app path was checked against the new grants.
SET lock_timeout = '5s';--> statement-breakpoint

-- HIGH-2: a dedicated NOLOGIN role owns the SECURITY DEFINER helpers (not moz_auth, whose login Better Auth
-- holds). The migrator joins it so a non-superuser owner can hand functions over; CREATE is granted only
-- for the hand-over and revoked at once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_rls') THEN
    CREATE ROLE moz_rls NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;--> statement-breakpoint
GRANT moz_rls TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
GRANT SELECT ON shop_staff, admin_members TO moz_rls;--> statement-breakpoint
GRANT SELECT, DELETE ON sessions TO moz_rls;--> statement-breakpoint
CREATE POLICY shop_staff_rls_read ON shop_staff AS PERMISSIVE FOR SELECT TO moz_rls USING (true);--> statement-breakpoint
CREATE POLICY admin_members_rls_read ON admin_members AS PERMISSIVE FOR SELECT TO moz_rls USING (true);--> statement-breakpoint
CREATE POLICY sessions_rls_revoke ON sessions AS PERMISSIVE FOR ALL TO moz_rls USING (true) WITH CHECK (true);--> statement-breakpoint

-- Role of the caller in the scoped shop / admin team (NULL when none or inactive): policies bind writes to it.
CREATE OR REPLACE FUNCTION public.app_shop_role() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN (SELECT s.role::text FROM public.shop_staff s
          WHERE public.app_scope() = 'shop' AND s.user_id = public.app_user_id()
            AND s.shop_id = public.app_shop_id() AND s.active);
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_admin_role() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN (SELECT a.role::text FROM public.admin_members a
          WHERE public.app_scope() = 'admin' AND a.user_id = public.app_user_id() AND a.active);
END;
$$;--> statement-breakpoint
ALTER FUNCTION public.app_in_shop() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.app_is_admin() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.revoke_sessions_on_privilege_change() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION public.app_in_shop() OWNER TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.app_is_admin() OWNER TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.app_shop_role() OWNER TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.app_admin_role() OWNER TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.revoke_sessions_on_privilege_change() OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;--> statement-breakpoint

-- 5: only an owner changes a shop team; only the admin owner changes the admin team.
DROP POLICY shop_staff_shop ON shop_staff;--> statement-breakpoint
CREATE POLICY shop_staff_shop ON shop_staff AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY shop_staff_owner_write ON shop_staff AS PERMISSIVE FOR ALL TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner')
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_shop_role()) = 'owner');--> statement-breakpoint
DROP POLICY shop_staff_admin ON shop_staff;--> statement-breakpoint
CREATE POLICY shop_staff_admin ON shop_staff AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint
DROP POLICY admin_members_admin ON admin_members;--> statement-breakpoint
CREATE POLICY admin_members_admin ON admin_members AS PERMISSIVE FOR SELECT TO moz_app USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY admin_members_owner_write ON admin_members AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_admin_role()) = 'owner') WITH CHECK ((SELECT app_admin_role()) = 'owner');--> statement-breakpoint

-- 7: identity columns the web never needs. No account rows (password hash, OAuth tokens); only name/image
-- of the own user row are writable; sessions without the token.
REVOKE SELECT ON accounts FROM moz_app;--> statement-breakpoint
DROP POLICY accounts_own ON accounts;--> statement-breakpoint
REVOKE UPDATE ON users FROM moz_app;--> statement-breakpoint
GRANT UPDATE (name, image) ON users TO moz_app;--> statement-breakpoint
REVOKE SELECT ON sessions FROM moz_app;--> statement-breakpoint
GRANT SELECT (id, user_id, user_agent, created_at, updated_at, expires_at) ON sessions TO moz_app;--> statement-breakpoint

-- 8: the web role can't forge another actor in the audit log.
DROP POLICY audit_logs_append ON audit_logs;--> statement-breakpoint
CREATE POLICY audit_logs_app_append ON audit_logs AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK ((SELECT app_scope()) IS NOT NULL AND actor_id IS NOT DISTINCT FROM (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY audit_logs_auth_append ON audit_logs AS PERMISSIVE FOR INSERT TO moz_auth WITH CHECK (true);--> statement-breakpoint

-- 4: an outbox row's role is the writer's real role, so a rebuilt job scope is never higher.
DROP POLICY outbox_append ON outbox;--> statement-breakpoint
CREATE POLICY outbox_append ON outbox AS PERMISSIVE FOR INSERT TO moz_app WITH CHECK (
  scope_kind = (SELECT app_scope()) AND scope_kind IN ('customer', 'shop', 'admin')
  AND scope_user_id = (SELECT app_user_id())
  AND scope_shop_id IS NOT DISTINCT FROM (SELECT app_shop_id())
  AND scope_role IS NOT DISTINCT FROM (CASE scope_kind WHEN 'shop' THEN (SELECT app_shop_role())
    WHEN 'admin' THEN (SELECT app_admin_role()) END));--> statement-breakpoint

-- 6: global configuration is readable by all, writable only by an active admin (a kill switch can't be
-- flipped by a public or tenant code path).
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_settings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY feature_flags_read ON feature_flags AS PERMISSIVE FOR SELECT TO moz_app, moz_auth USING (true);--> statement-breakpoint
CREATE POLICY feature_flags_admin ON feature_flags AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY content_settings_read ON content_settings AS PERMISSIVE FOR SELECT TO moz_app, moz_auth USING (true);--> statement-breakpoint
CREATE POLICY content_settings_admin ON content_settings AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint

-- 13: PostGIS's reference table is nobody's to change.
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.spatial_ref_sys FROM moz_app, moz_worker;
  END IF;
END;
$$;
