-- P1-13 (PRODUCT §4, §6): points expiry. Three parts.
-- 1. points_expiry_warnings: the daily job's record of each warning it sent (once per member, expiry date and
--    notice). Worker-only: the web role keeps no grant; admins may read (RLS, deny by default otherwise).
-- 2. The 30-day rule for left memberships, in one place: left_forfeit_at() (00:00 UK time on London day 31
--    after the leave day) and apply_left_forfeit(), which writes the `expiry` ledger row and zeroes the frozen
--    progress once (idempotency key from the leave). The daily job (moz_worker) calls it for every due row.
-- 3. C-73: a rejoin after the window must not restore frozen progress even if the job hasn't run yet. The rejoin
--    runs as the customer (moz_app), which may never write the ledger, so forfeit_own_left_progress() is a
--    SECURITY DEFINER wrapper owned by moz_forfeit: a dedicated NOLOGIN role (like moz_partitions, 0027) that
--    holds exactly what the forfeit needs (read five membership columns, update progress_gold/updated_at, insert
--    `expiry` ledger rows) and only for the caller's own left memberships (its RLS policies). Customer scope only;
--    another person's membership id returns 0 and changes nothing. On the VPS the bootstrap creates the role and
--    gives moz_owner ADMIN on it (infra/postgres/bootstrap.sql); locally this block creates it.
-- contract: none needed (new table, functions, role grants and policies; no rewrite of an existing table).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "points_expiry_warnings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"days_before" smallint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_expiry_warnings_days" CHECK ("points_expiry_warnings"."days_before" IN (30, 7))
);
--> statement-breakpoint
ALTER TABLE "points_expiry_warnings" ADD CONSTRAINT "points_expiry_warnings_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "points_expiry_warnings_once_uq" ON "points_expiry_warnings" USING btree ("membership_id","expires_at","days_before");
--> statement-breakpoint
REVOKE ALL ON points_expiry_warnings FROM PUBLIC, moz_app, moz_auth;--> statement-breakpoint
ALTER TABLE points_expiry_warnings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE points_expiry_warnings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY points_expiry_warnings_admin_read ON points_expiry_warnings AS PERMISSIVE FOR SELECT TO moz_app
  USING ((SELECT app_is_admin()));--> statement-breakpoint
GRANT SELECT ON points_expiry_warnings TO moz_app;--> statement-breakpoint

-- ── 2. The 30-day rule (day 0 = the leave day; a rejoin through day 30 restores, day 31 forfeits).
CREATE OR REPLACE FUNCTION public.left_forfeit_at(p_left_at timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT ((((p_left_at AT TIME ZONE 'Europe/London')::date + 31)::timestamp) AT TIME ZONE 'Europe/London')
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.left_forfeit_at(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.left_forfeit_at(timestamptz) TO moz_app, moz_worker;--> statement-breakpoint
-- Invoker rights: the job runs it as moz_worker; the wrapper below as moz_forfeit. Returns the gold forfeited
-- (0 = nothing due: not left, nothing frozen, or still inside the window). `p_entry_id` is the ledger row's id
-- (UUIDv7 minted by the caller, like every id: ARCHITECTURE §3).
CREATE OR REPLACE FUNCTION public.apply_left_forfeit(p_membership uuid, p_now timestamptz, p_entry_id uuid)
RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  m record;
BEGIN
  SELECT ms.id, ms.shop_id, ms.left_at, ms.progress_gold INTO m
    FROM public.memberships ms WHERE ms.id = p_membership FOR UPDATE;
  IF m.id IS NULL OR m.left_at IS NULL OR m.progress_gold = 0
     OR p_now < public.left_forfeit_at(m.left_at) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.ledger_entries (id, membership_id, shop_id, type, points, idempotency_key, ref)
  VALUES (p_entry_id, m.id, m.shop_id, 'expiry', -m.progress_gold,
          m.id::text || ':forfeit:' || floor(extract(epoch FROM m.left_at))::bigint::text,
          jsonb_build_object('reason', 'left'));
  UPDATE public.memberships SET progress_gold = 0, updated_at = now() WHERE id = m.id;
  RETURN m.progress_gold;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.apply_left_forfeit(uuid, timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_left_forfeit(uuid, timestamptz, uuid) TO moz_worker;--> statement-breakpoint

-- ── 3. C-73: the rejoin's forfeit, as moz_forfeit.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moz_forfeit') THEN
    CREATE ROLE moz_forfeit NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;--> statement-breakpoint
GRANT moz_forfeit TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO moz_forfeit;--> statement-breakpoint
GRANT SELECT (id, user_id, shop_id, left_at, progress_gold) ON memberships TO moz_forfeit;--> statement-breakpoint
GRANT UPDATE (progress_gold, updated_at) ON memberships TO moz_forfeit;--> statement-breakpoint
GRANT INSERT (id, membership_id, shop_id, type, points, idempotency_key, ref) ON ledger_entries TO moz_forfeit;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.left_forfeit_at(timestamptz) TO moz_forfeit;--> statement-breakpoint
CREATE POLICY memberships_forfeit_own_left ON memberships AS PERMISSIVE FOR SELECT TO moz_forfeit
  USING (user_id = (SELECT app_user_id()) AND left_at IS NOT NULL);--> statement-breakpoint
CREATE POLICY memberships_forfeit_own_left_update ON memberships AS PERMISSIVE FOR UPDATE TO moz_forfeit
  USING (user_id = (SELECT app_user_id()) AND left_at IS NOT NULL)
  WITH CHECK (user_id = (SELECT app_user_id()) AND left_at IS NOT NULL);--> statement-breakpoint
CREATE POLICY ledger_entries_forfeit_insert ON ledger_entries AS PERMISSIVE FOR INSERT TO moz_forfeit
  WITH CHECK (type = 'expiry' AND points < 0 AND ref = '{"reason": "left"}'::jsonb
              AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = ledger_entries.membership_id
                            AND m.shop_id = ledger_entries.shop_id
                            AND m.user_id = (SELECT app_user_id()) AND m.left_at IS NOT NULL));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.forfeit_own_left_progress(p_membership uuid, p_entry_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF public.app_scope() IS DISTINCT FROM 'customer' OR public.app_user_id() IS NULL THEN
    RAISE EXCEPTION 'forfeit_own_left_progress: a customer''s own membership only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- RLS shows moz_forfeit only the caller's own left memberships: anyone else's id finds nothing here.
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id = p_membership) THEN
    RETURN 0;
  END IF;
  RETURN public.apply_left_forfeit(p_membership, now(), p_entry_id);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.forfeit_own_left_progress(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.forfeit_own_left_progress(uuid, uuid) TO moz_app;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_forfeit;--> statement-breakpoint
ALTER FUNCTION public.left_forfeit_at(timestamptz) OWNER TO moz_forfeit;--> statement-breakpoint
ALTER FUNCTION public.apply_left_forfeit(uuid, timestamptz, uuid) OWNER TO moz_forfeit;--> statement-breakpoint
ALTER FUNCTION public.forfeit_own_left_progress(uuid, uuid) OWNER TO moz_forfeit;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_forfeit;
