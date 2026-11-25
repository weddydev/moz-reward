-- P1-10: in-app notifications (ARCHITECTURE §4, §7; ENGINEERING §4: large append-only tables are partitioned
-- monthly and retention drops whole partitions). A new, empty table. Drizzle does not model partitioning, so the
-- generated CREATE TABLE is hand-edited to PARTITION BY RANGE (created_at); the primary key includes the
-- partition key, as Postgres requires.
-- Privileges and RLS (security design check, P1-10):
--  * Policies on a partitioned table apply only to queries made through the parent, and the default privileges
--    (0003) would give moz_app full DML on every partition. So each partition is created by
--    ensure_notifications_partitions() with ALL privileges revoked from PUBLIC, moz_app and moz_auth, and RLS
--    enabled + forced with no policy (deny): the web role can reach rows only through the parent's policies.
--  * The recipient reads their own rows (customer scope) and may set read_at only (column grant). A shop's team
--    inserts rows for its own members or staff only. No customer or admin insert in P1 (deny by default); the
--    worker (BYPASSRLS) writes system notices. No DELETE/TRUNCATE for moz_app: retention drops partitions.
SET lock_timeout = '5s';--> statement-breakpoint
-- The partition function is SECURITY DEFINER and must be owned by a NOLOGIN role (catalog test, C-32), and only
-- the parent's owner may attach partitions: so a dedicated NOLOGIN role, moz_partitions, owns the parent and the
-- function and nothing else. On the VPS the bootstrap creates it first (moz_owner has no CREATEROLE) and gives
-- moz_owner ADMIN on it, as for moz_rls (infra/postgres/bootstrap.sql); locally this block creates it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_partitions') THEN
    CREATE ROLE moz_partitions NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;--> statement-breakpoint
GRANT moz_partitions TO CURRENT_USER;--> statement-breakpoint
-- To create partitions (tables) in public and clone the parent's foreign keys onto them.
GRANT USAGE, CREATE ON SCHEMA public TO moz_partitions;--> statement-breakpoint
GRANT REFERENCES ON users, shops TO moz_partitions;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_id" uuid,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "notifications_type_format" CHECK ("notifications"."type" ~ '^[a-z][a-z_]{2,39}$'),
	CONSTRAINT "notifications_category" CHECK ("notifications"."category" IN ('transactional', 'marketing')),
	CONSTRAINT "notifications_payload_shape" CHECK (jsonb_typeof("notifications"."payload") = 'object' AND pg_column_size("notifications"."payload") <= 2048)
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint

ALTER TABLE notifications OWNER TO moz_partitions;--> statement-breakpoint

-- Parent privileges: read own, set read_at, insert through policies; never delete, truncate or change content.
REVOKE ALL ON notifications FROM PUBLIC, moz_auth;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON notifications FROM moz_app;--> statement-breakpoint
GRANT UPDATE (read_at) ON notifications TO moz_app;--> statement-breakpoint

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notifications_own_read ON notifications AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id()));--> statement-breakpoint
CREATE POLICY notifications_own_mark_read ON notifications AS PERMISSIVE FOR UPDATE TO moz_app
  USING ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id()))
  WITH CHECK ((SELECT app_scope()) = 'customer' AND user_id = (SELECT app_user_id()));--> statement-breakpoint
-- A shop's team notifies its own customers (an active or past membership) or its own staff; nobody else. Both
-- lookups run under the shop scope's own RLS (memberships_shop / shop_staff_shop), so no definer helper exists
-- that could answer "is user X a member of shop Y" for another shop.
CREATE POLICY notifications_shop_insert ON notifications AS PERMISSIVE FOR INSERT TO moz_app
  WITH CHECK (
    shop_id = (SELECT app_shop_id()) AND (SELECT app_in_shop())
    AND (
      EXISTS (SELECT 1 FROM memberships m WHERE m.shop_id = notifications.shop_id AND m.user_id = notifications.user_id)
      OR EXISTS (SELECT 1 FROM shop_staff s WHERE s.shop_id = notifications.shop_id AND s.user_id = notifications.user_id AND s.active)
    )
  );--> statement-breakpoint

-- Monthly partitions, created ahead (ARCHITECTURE §4: at least 2 months; the daily `partitions-ensure` job keeps
-- 3 ahead and the health monitor alerts below 2). SECURITY DEFINER because only the parent's owner may attach a
-- partition (moz_partitions); it takes no table name (no injection surface), bounds its input, builds names only from dates, pins
-- search_path and is executable by moz_worker alone. No DEFAULT partition: it would block creating a month that
-- already has rows in it; the 2-month alert gives the lead time instead.
CREATE OR REPLACE FUNCTION public.ensure_notifications_partitions(p_months integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  first_month date := date_trunc('month', (now() AT TIME ZONE 'UTC'))::date;
  m date;
  part text;
  created integer := 0;
BEGIN
  IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
    RAISE EXCEPTION 'ensure_notifications_partitions: months must be 1..12, got %', p_months;
  END IF;
  FOR i IN 0..p_months LOOP
    m := (first_month + make_interval(months => i))::date;
    part := 'notifications_' || to_char(m, 'YYYYMM');
    IF to_regclass('public.' || quote_ident(part)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.notifications FOR VALUES FROM (%L) TO (%L)',
        part,
        (m::text || ' 00:00:00+00'),
        ((m + interval '1 month')::date::text || ' 00:00:00+00')
      );
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, moz_app, moz_auth', part);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', part);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END;
$$;--> statement-breakpoint
ALTER FUNCTION public.ensure_notifications_partitions(integer) OWNER TO moz_partitions;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ensure_notifications_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.ensure_notifications_partitions(integer) TO moz_worker;--> statement-breakpoint
SELECT public.ensure_notifications_partitions(3);
