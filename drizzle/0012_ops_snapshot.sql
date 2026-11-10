-- P0-13: the health monitor's latest snapshot for the admin System page. One row (id = 1), written by the
-- worker (moz_worker, BYPASSRLS), read only by an active admin owner through RLS. New, empty table.
CREATE TABLE "ops_snapshot" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_snapshot_single_row" CHECK ("ops_snapshot"."id" = 1)
);--> statement-breakpoint
CREATE TRIGGER ops_snapshot_set_updated_at BEFORE UPDATE ON ops_snapshot
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- The default privileges (0003) gave moz_app full DML: the web only reads it.
REVOKE ALL ON ops_snapshot FROM moz_app;--> statement-breakpoint
GRANT SELECT ON ops_snapshot TO moz_app;--> statement-breakpoint
ALTER TABLE ops_snapshot ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ops_snapshot FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ops_snapshot_admin_owner ON ops_snapshot AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_admin_role()) = 'owner');
