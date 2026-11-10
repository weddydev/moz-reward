-- P0-20 (SECURITY §3, ARCHITECTURE §3): Row-Level Security is the second wall behind the app's scoped repos.
-- Every shop- and user-scoped table gets ENABLE + FORCE ROW LEVEL SECURITY and explicit per-role policies
-- (scripts/check-migrations.ts fails a scoped table without them; tests/integration/rls-*.test.ts prove them).
--
-- Roles (group roles, NOLOGIN here; each environment's bootstrap gives them LOGIN + a password, DECISIONS P0-20):
--   moz_app    web requests and tenant jobs. No BYPASSRLS. Sees rows through the settings the scoped
--              transaction helper sets with SET LOCAL: app.scope, app.user_id, app.shop_id (_base.ts).
--   moz_auth   Better Auth and identity resolution (who is this session / email, which roles). Runs before any
--              scope exists, so its policies are role-wide, but it is granted only the identity tables, a
--              read of shop_staff/admin_members, and INSERT on audit_logs/outbox. No BYPASSRLS.
--   moz_worker cross-shop system sweeps (outbox relay, retention, DLQ). BYPASSRLS; every run is audit-logged.
-- Creating a BYPASSRLS role needs a superuser: locally the migration role is one; on the VPS the bootstrap
-- (P0-15, C-32) creates the roles first and these IF NOT EXISTS blocks are no-ops.
--
-- contract: no data is removed or rewritten. Outbox gains nullable/defaulted columns; privileges move from the
-- broad 0003 grants to the narrow ones below before any table holds tenant data (P0, no P1 table exists yet).
SET lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "scope_kind" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "scope_user_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "scope_shop_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "scope_role" text;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_scope_kind" CHECK ("outbox"."scope_kind" IN ('customer', 'shop', 'admin', 'auth', 'system')) NOT VALID;--> statement-breakpoint

-- 1. Roles.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_auth') THEN
    CREATE ROLE moz_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_worker') THEN
    CREATE ROLE moz_worker NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_app' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'moz_app must not bypass row-level security';
  END IF;
END;
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO moz_auth, moz_worker;--> statement-breakpoint

-- 2. Settings readers. SET LOCAL values live for one transaction only, so a pooled connection never carries a
--    previous request's tenant. Unset or empty = NULL, which matches no row.
CREATE OR REPLACE FUNCTION public.app_scope() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT NULLIF(pg_catalog.current_setting('app.scope', true), '') $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT NULLIF(pg_catalog.current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_shop_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN public.app_scope() = 'shop'
    THEN NULLIF(pg_catalog.current_setting('app.shop_id', true), '')::uuid END
$$;--> statement-breakpoint

-- 3. Role checks done by the database itself, so a wrongly built scope (or a member removed mid-request) gets
--    nothing: shop scope needs an active shop_staff row for (user, shop); admin scope an active admin_members
--    row. SECURITY DEFINER as moz_auth (it may read those tables; no BYPASSRLS), with a pinned search_path.
--    PL/pgSQL, not SQL: a definer SQL function is re-planned in every statement (~0.08 ms), PL/pgSQL keeps its
--    plan per connection (~0.02 ms).
--    Policies call every helper as `(SELECT f())` so Postgres evaluates it once per statement (an InitPlan),
--    not once per row: inlined current_setting() calls per row cost +65% p95 on a 2,000-row shop page
--    (scripts/rls-bench.ts, AC3).
CREATE OR REPLACE FUNCTION public.app_in_shop() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN public.app_scope() = 'shop' AND EXISTS (
    SELECT 1 FROM public.shop_staff s
    WHERE s.user_id = public.app_user_id() AND s.shop_id = public.app_shop_id() AND s.active);
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.app_is_admin() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN public.app_scope() = 'admin' AND EXISTS (
    SELECT 1 FROM public.admin_members a WHERE a.user_id = public.app_user_id() AND a.active);
END;
$$;--> statement-breakpoint

-- 4. Privileges. Start from nothing for the identity and system tables, then grant what each role needs.
REVOKE ALL ON users, sessions, accounts, verifications, two_factors, passkeys FROM moz_app;--> statement-breakpoint
REVOKE ALL ON failed_jobs, job_heartbeats, outbox FROM moz_app;--> statement-breakpoint
REVOKE DELETE ON shops, memberships FROM moz_app;--> statement-breakpoint
GRANT SELECT, UPDATE ON users TO moz_app;--> statement-breakpoint
GRANT SELECT, DELETE ON sessions, passkeys TO moz_app;--> statement-breakpoint
GRANT SELECT ON accounts TO moz_app;--> statement-breakpoint
-- C-29: the web role appends to the outbox and nothing else (ids are generated by the app; no RETURNING).
GRANT INSERT ON outbox TO moz_app;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications, two_factors, passkeys TO moz_auth;--> statement-breakpoint
GRANT SELECT ON shop_staff, admin_members, feature_flags, content_settings TO moz_auth;--> statement-breakpoint
GRANT INSERT ON audit_logs, outbox TO moz_auth;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moz_worker;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moz_worker;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM moz_worker;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO moz_worker;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO moz_worker;--> statement-breakpoint

-- 5. The definer functions run as moz_auth (step 3). Session revocation on a role change (0006/0007) deletes
--    another user's sessions, which moz_app's policies forbid, so it runs as moz_auth too.
ALTER FUNCTION public.app_in_shop() OWNER TO moz_auth;--> statement-breakpoint
ALTER FUNCTION public.app_is_admin() OWNER TO moz_auth;--> statement-breakpoint
ALTER FUNCTION public.revoke_sessions_on_privilege_change() SECURITY DEFINER;--> statement-breakpoint
ALTER FUNCTION public.revoke_sessions_on_privilege_change() OWNER TO moz_auth;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.revoke_sessions_on_privilege_change() FROM PUBLIC;--> statement-breakpoint

-- 6. Enable and force RLS (FORCE: the table owner is filtered too; only superusers and BYPASSRLS skip it).
--    Written out per table (no dynamic SQL) so scripts/check-migrations.ts can verify every scoped table.
--    Every table gets RLS unless a migration declares it global with a reason (deny by default).
--    (feature_flags and content_settings were listed here before 0010 gave them RLS; markers removed.)
-- rls: global failed_jobs — dead-letter rows of the worker; moz_app has no grant at all
-- rls: global job_heartbeats — scheduler liveness rows of the worker; moz_app has no grant at all
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE verifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE two_factors ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE two_factors FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE passkeys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE passkeys FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customer_profiles FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shops FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_staff ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shop_staff FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE admin_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE admin_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- 7. Policies. Permissive policies OR together per command; a command with no policy for a role is denied.
--    moz_auth: identity tables, whole-table (it runs before a scope exists; its grants are the limit).
CREATE POLICY users_auth ON users AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY sessions_auth ON sessions AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY accounts_auth ON accounts AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY verifications_auth ON verifications AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY two_factors_auth ON two_factors AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY passkeys_auth ON passkeys AS PERMISSIVE FOR ALL TO moz_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY shop_staff_auth_read ON shop_staff AS PERMISSIVE FOR SELECT TO moz_auth USING (true);--> statement-breakpoint
CREATE POLICY admin_members_auth_read ON admin_members AS PERMISSIVE FOR SELECT TO moz_auth USING (true);--> statement-breakpoint

-- moz_app: a signed-in user's own identity rows.
CREATE POLICY users_own ON users AS PERMISSIVE FOR SELECT TO moz_app USING (id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY users_own_update ON users AS PERMISSIVE FOR UPDATE TO moz_app
  USING (id = (SELECT app_user_id())) WITH CHECK (id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY users_admin ON users AS PERMISSIVE FOR SELECT TO moz_app USING ((SELECT app_is_admin()));--> statement-breakpoint
CREATE POLICY sessions_own ON sessions AS PERMISSIVE FOR SELECT TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY sessions_own_delete ON sessions AS PERMISSIVE FOR DELETE TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY passkeys_own ON passkeys AS PERMISSIVE FOR SELECT TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY passkeys_own_delete ON passkeys AS PERMISSIVE FOR DELETE TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY accounts_own ON accounts AS PERMISSIVE FOR SELECT TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
-- verifications and two_factors: moz_auth only (no moz_app grant, no moz_app policy: denied).

-- customer_profiles: the customer's own; admins read.
CREATE POLICY customer_profiles_own ON customer_profiles AS PERMISSIVE FOR ALL TO moz_app
  USING (user_id = (SELECT app_user_id())) WITH CHECK (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY customer_profiles_admin ON customer_profiles AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint

-- shops: public directory data except pending shops (PRODUCT §15); a shop's own team sees and edits its row;
-- admins read, create and edit every shop. No DELETE (shops close by status).
CREATE POLICY shops_public ON shops AS PERMISSIVE FOR SELECT TO moz_app USING (status <> 'pending');--> statement-breakpoint
CREATE POLICY shops_own ON shops AS PERMISSIVE FOR SELECT TO moz_app
  USING (id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY shops_own_update ON shops AS PERMISSIVE FOR UPDATE TO moz_app
  USING (id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY shops_admin ON shops AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint

-- shop_staff: a user sees their own memberships of shop teams; a shop's team sees and manages its own team
-- (owner-only rules are enforced by the app's role policies); admins manage all.
CREATE POLICY shop_staff_own ON shop_staff AS PERMISSIVE FOR SELECT TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY shop_staff_shop ON shop_staff AS PERMISSIVE FOR ALL TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY shop_staff_admin ON shop_staff AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint

-- admin_members: an admin sees their own row; admins manage the team (role rules in the app).
CREATE POLICY admin_members_own ON admin_members AS PERMISSIVE FOR SELECT TO moz_app USING (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY admin_members_admin ON admin_members AS PERMISSIVE FOR ALL TO moz_app
  USING ((SELECT app_is_admin())) WITH CHECK ((SELECT app_is_admin()));--> statement-breakpoint

-- memberships: the customer's own; the shop's team reads and updates its members; admins read.
CREATE POLICY memberships_own ON memberships AS PERMISSIVE FOR ALL TO moz_app
  USING (user_id = (SELECT app_user_id())) WITH CHECK (user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY memberships_shop ON memberships AS PERMISSIVE FOR SELECT TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY memberships_shop_update ON memberships AS PERMISSIVE FOR UPDATE TO moz_app
  USING (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()))
  WITH CHECK (shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop()));--> statement-breakpoint
CREATE POLICY memberships_admin ON memberships AS PERMISSIVE FOR SELECT TO moz_app USING ((SELECT app_is_admin()));--> statement-breakpoint

-- audit_logs: anyone appends (append-only by grant and trigger); only admins read.
CREATE POLICY audit_logs_append ON audit_logs AS PERMISSIVE FOR INSERT TO moz_app, moz_auth WITH CHECK (true);--> statement-breakpoint
CREATE POLICY audit_logs_admin ON audit_logs AS PERMISSIVE FOR SELECT TO moz_app USING ((SELECT app_is_admin()));--> statement-breakpoint

-- outbox (C-30): a row records the scope that wrote it, and that must be the writer's real scope, so a tenant
-- job can be rebuilt under the same walls. Only the worker reads it (BYPASSRLS).
CREATE POLICY outbox_append ON outbox AS PERMISSIVE FOR INSERT TO moz_app WITH CHECK (
  scope_kind = (SELECT app_scope()) AND scope_kind IN ('customer', 'shop', 'admin')
  AND scope_user_id = (SELECT app_user_id())
  AND scope_shop_id IS NOT DISTINCT FROM (SELECT app_shop_id()));--> statement-breakpoint
CREATE POLICY outbox_auth_append ON outbox AS PERMISSIVE FOR INSERT TO moz_auth WITH CHECK (
  scope_kind = 'auth' AND scope_shop_id IS NULL);
