-- P0-15 C1b: host jobs other than backups record their heartbeats only through this function, which accepts
-- the origin firewall's two names and nothing else (infra/host/moz-origin-firewall: the daily refresh of
-- Cloudflare's ranges writes `host:origin-firewall`, or `host:origin-firewall-failed` when the list is
-- suspicious, stale or could not be applied; health.origin_firewall alerts on either). Same shape as 0016:
-- SECURITY DEFINER, owned by moz_rls, no EXECUTE for any role: only the superuser over the socket calls it.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_host_heartbeat(p_name text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('host:origin-firewall', 'host:origin-firewall-failed') THEN
    RAISE EXCEPTION 'record_host_heartbeat: not a host heartbeat name' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_heartbeats (name, last_run_at) VALUES (p_name, now())
  ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, updated_at = now();
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_host_heartbeat(text) FROM PUBLIC;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.record_host_heartbeat(text) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
