-- P0-15 D1: the host's backup job (infra/host/moz-backup, run by systemd as root; it reaches Postgres as the
-- superuser over the container's socket) records its heartbeats only through this function, which accepts
-- `backup:<name>` and nothing else, so a mistake in the script can't touch the scheduler's or other rows.
-- Owned by moz_rls (the NOLOGIN owner of every SECURITY DEFINER helper, 0010), which gets exactly the
-- job_heartbeats privileges the upsert needs. No role is granted EXECUTE: only the superuser calls it.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_backup_heartbeat(p_name text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_name IS NULL OR p_name !~ '^backup:[a-z][a-z-]{0,39}$' THEN
    RAISE EXCEPTION 'record_backup_heartbeat: not a backup heartbeat name' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_heartbeats (name, last_run_at) VALUES (p_name, now())
  ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, updated_at = now();
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_backup_heartbeat(text) FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON job_heartbeats TO moz_rls;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.record_backup_heartbeat(text) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
