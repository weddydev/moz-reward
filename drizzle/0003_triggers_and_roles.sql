-- P0-03: generic trigger functions and the least-privilege app role (ENGINEERING §6, SECURITY §11, audit #7).

-- 1. Generic append-only guard under the brief's name. Same behaviour as prevent_update_delete() (0001),
--    which is replaced here; ledger_entries (P1) attaches the same function.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();--> statement-breakpoint
DROP FUNCTION IF EXISTS prevent_update_delete();--> statement-breakpoint

-- 2. updated_at maintained by the DB, so raw SQL, jobs and the auth library are covered too.
--    Attached to every current table with an updated_at column. New tables attach it in their own migration;
--    tests/integration/db-foundation.test.ts fails if one is missed.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;--> statement-breakpoint

-- 3. moz_app: the privileges the running app gets (group role, NOLOGIN, no password in the repo).
--    Each environment's app login role is made a member (`GRANT moz_app TO <login>`); migrations keep using
--    the owner role. DML on every table, but never UPDATE/DELETE/TRUNCATE on append-only tables, so even
--    an app bug or SQL injection cannot rewrite history (the triggers are the second line of defence).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_app') THEN
    CREATE ROLE moz_app NOLOGIN;
  END IF;
END;
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO moz_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moz_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moz_app;--> statement-breakpoint
-- Tables created later by the migration role get the same DML grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO moz_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO moz_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM moz_app;
