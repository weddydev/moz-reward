-- Staging/production Postgres bootstrap (P0-15, C-32; SECURITY §11). Idempotent: run as the superuser over the
-- Unix socket before the first migration and again after any change to this file. `moz-deploy bootstrap-db`
-- streams it on stdin after a header that sets the psql variables below (passwords never touch argv, a file
-- in the container, or the server log):
--   :app_password  :auth_password  :worker_password  (generated on the host, root-only)
--   :with_umami    on|off        :umami_password    (production only)
-- The migration owner's password is NOT set here: it lives only in GitHub secrets and the password manager
-- and reaches Postgres over stdin from the deploy job (`moz-deploy set-owner-password`).
\set ON_ERROR_STOP on
SET log_statement = 'none';
SET password_encryption = 'scram-sha-256';

-- 1. Roles. moz_owner runs the migrations: not a superuser, cannot bypass RLS, cannot create roles or databases.
SELECT 'CREATE ROLE moz_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moz_owner') \gexec
ALTER ROLE moz_owner WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;

SELECT 'CREATE ROLE moz_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moz_app') \gexec
ALTER ROLE moz_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
  PASSWORD :'app_password';

SELECT 'CREATE ROLE moz_auth' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moz_auth') \gexec
ALTER ROLE moz_auth WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
  PASSWORD :'auth_password';

-- Cross-shop sweeps (worker/CLI containers only).
SELECT 'CREATE ROLE moz_worker' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moz_worker') \gexec
ALTER ROLE moz_worker WITH LOGIN NOSUPERUSER BYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
  PASSWORD :'worker_password';

-- Owner of the SECURITY DEFINER helpers (0010). Never logs in (boot asserts rolcanlogin = false). The owner
-- gets it WITH ADMIN so 0010's `GRANT moz_rls TO CURRENT_USER` works without CREATEROLE.
SELECT 'CREATE ROLE moz_rls' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'moz_rls') \gexec
ALTER ROLE moz_rls WITH NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD NULL;
GRANT moz_rls TO moz_owner WITH ADMIN OPTION;

-- No runtime login is a member of another (a web login must not SET ROLE to moz_worker or moz_auth; boot
-- checks it too). Any such membership, however it was granted, is removed.
SELECT format('REVOKE %I FROM %I CASCADE', r.rolname, m.rolname)
  FROM pg_auth_members am
  JOIN pg_roles r ON r.oid = am.roleid
  JOIN pg_roles m ON m.oid = am.member
 WHERE m.rolname IN ('moz_app', 'moz_auth', 'moz_worker') \gexec

-- 2. The app database, owned by the migration owner. Nobody else may even connect unless granted.
SELECT 'CREATE DATABASE moz OWNER moz_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'moz') \gexec
ALTER DATABASE moz OWNER TO moz_owner;
REVOKE ALL ON DATABASE moz FROM PUBLIC;
GRANT CONNECT ON DATABASE moz TO moz_owner, moz_app, moz_auth, moz_worker;
GRANT CONNECT, TEMPORARY ON DATABASE moz TO moz_owner;

-- 3. Umami (production): its own role and database, no access to the app database.
\if :with_umami
SELECT 'CREATE ROLE umami' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'umami') \gexec
ALTER ROLE umami WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
  PASSWORD :'umami_password';
SELECT 'CREATE DATABASE umami OWNER umami' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami') \gexec
ALTER DATABASE umami OWNER TO umami;
REVOKE ALL ON DATABASE umami FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE umami TO umami;
\endif

-- 4. Inside the app database: the owner owns the schema; PUBLIC can't create in it.
\connect moz
SET log_statement = 'none';
ALTER SCHEMA public OWNER TO moz_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- Extensions need the superuser (the owner has no CREATE EXTENSION rights for untrusted ones). 0000's
-- `CREATE EXTENSION IF NOT EXISTS postgis` then finds it and does nothing.
CREATE EXTENSION IF NOT EXISTS postgis;
-- 0010 §13 re-applied here because the superuser owns PostGIS's table (a (re)created extension resets it).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.spatial_ref_sys FROM PUBLIC, moz_owner, moz_app, moz_auth, moz_worker;

-- 5. Fresh-database shim for migration 0009 (merged migrations are never edited). 0009 hands the definer
--    functions to moz_auth before 0010 moves them to moz_rls; ALTER ... OWNER TO needs the migration role to
--    be able to SET ROLE moz_auth and moz_auth to have CREATE on the schema (a superuser skips both checks,
--    which is why local/CI never needed this). Granted only while 0010 hasn't run; the release runs this
--    bootstrap again after migrating, which takes both back for good.
SELECT NOT EXISTS (
  SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'app_in_shop' AND pg_get_userbyid(p.proowner) = 'moz_rls'
) AS before_0010 \gset
\if :before_0010
GRANT moz_auth TO moz_owner WITH INHERIT TRUE, SET TRUE;
GRANT CREATE ON SCHEMA public TO moz_auth;
\else
SELECT 'REVOKE moz_auth FROM moz_owner' WHERE pg_has_role('moz_owner', 'moz_auth', 'MEMBER') \gexec
REVOKE CREATE ON SCHEMA public FROM moz_auth;
\endif
