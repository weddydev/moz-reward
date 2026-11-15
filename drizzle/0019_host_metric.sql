-- P0-15 C1b: the staging origin certificate's expiry (epoch seconds). infra/host/moz-deploy records
-- `host:origin-cert-expiry` at every staging release and whenever `write-env staging origin-tls` installs a
-- certificate; health.origin_firewall alerts 30 days before it. Same shape as 0017/0018: SECURITY DEFINER,
-- owned by moz_rls, accepts only this name, no EXECUTE for any role: only the superuser over the socket calls it.
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_host_metric(p_name text, p_value bigint) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('host:origin-cert-expiry') THEN
    RAISE EXCEPTION 'record_host_metric: not a host metric name' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'record_host_metric: value must be a non-negative number' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_heartbeats (name, last_run_at, value) VALUES (p_name, now(), p_value)
  ON CONFLICT (name) DO UPDATE SET last_run_at = excluded.last_run_at, value = excluded.value, updated_at = now();
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_host_metric(text, bigint) FROM PUBLIC;--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.record_host_metric(text, bigint) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
